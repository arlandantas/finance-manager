import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import type { UpdateFamilyInput } from "@/modules/familia/schemas";

export const LAST_ADMIN_MSG =
  "A família precisa de pelo menos um Administrador. Promova outro membro antes.";

/**
 * Lock de família (ADR-019 §5): serializa rebaixar/remover/sair. Depois do lock, reconfere que quem age
 * ainda é membro ATIVO (e, se `needAdmin`, ainda Administrador): o papel lido no início da requisição
 * pode ter mudado enquanto esperava o lock.
 */
export async function lockFamilyAdmins(
  tx: Tx,
  ctx: { familyId: string; memberId: string },
  needAdmin = false,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`family:${ctx.familyId}`}, 0))`;
  const actor = await tx.member.findFirst({
    where: { id: ctx.memberId, familyId: ctx.familyId, removedAt: null },
    select: { role: true },
  });
  if (!actor || (needAdmin && actor.role !== "ADMIN")) throw forbidden();
}

async function nameOf(tx: Tx, familyId: string, memberId: string | null): Promise<string> {
  if (!memberId) return "outra pessoa";
  const m = await tx.member.findFirst({
    where: { id: memberId, familyId },
    include: { user: true },
  });
  return (m?.user.name ?? (m ? localPart(m.user.email) : "outra pessoa")).split(" ")[0] as string;
}

/** PATCH /family (SDD-012 §4.2): nome, com versão e `FamilyEvent`. */
export async function updateFamily(tx: Tx, ctx: RequestContext, input: UpdateFamilyInput) {
  const rows = await tx.$queryRaw<
    Array<{
      name: string;
      version: number;
      updatedByMemberId: string | null;
      settlementEnabled: boolean;
    }>
  >`
    SELECT name, version, "updatedByMemberId", "settlementEnabled" FROM families WHERE id = ${ctx.familyId}::uuid FOR UPDATE`;
  const fam = rows[0];
  if (!fam) throw notFound("Família não encontrada.");
  if (input.version !== fam.version) {
    throw conflict(
      "VERSION_CONFLICT",
      `A família foi alterada por ${await nameOf(tx, ctx.familyId, fam.updatedByMemberId)}. Recarregue para continuar.`,
    );
  }
  if (input.name === fam.name) {
    return {
      family: {
        id: ctx.familyId,
        name: fam.name,
        version: fam.version,
        settlementEnabled: fam.settlementEnabled,
      },
    };
  }
  const updated = await tx.family.update({
    where: { id: ctx.familyId },
    data: { name: input.name, version: { increment: 1 }, updatedByMemberId: ctx.memberId },
  });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "FAMILY_RENAMED",
      actorMemberId: ctx.memberId,
      changes: { name: { from: fam.name, to: input.name } },
    },
  });
  return {
    family: {
      id: updated.id,
      name: updated.name,
      version: updated.version,
      settlementEnabled: updated.settlementEnabled,
    },
  };
}

/** PATCH /members/:id (SDD-012 §4.2): papel; nunca deixa a família sem Administrador. */
export async function changeRole(
  tx: Tx,
  ctx: RequestContext,
  memberId: string,
  role: "ADMIN" | "MEMBER",
) {
  await lockFamilyAdmins(tx, ctx, true);
  const target = await tx.member.findFirst({
    where: { id: memberId, familyId: ctx.familyId, removedAt: null },
    include: { user: true },
  });
  if (!target) throw notFound("Membro não encontrado.");
  const dto = (r: string) => ({
    member: {
      memberId: target.id,
      name: target.user.name ?? localPart(target.user.email),
      role: r,
    },
  });
  if (target.role === role) return dto(role);
  if (target.role === "ADMIN" && role === "MEMBER") {
    const admins = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM members WHERE "familyId" = ${ctx.familyId}::uuid AND role = 'ADMIN' AND "removedAt" IS NULL ORDER BY id FOR UPDATE`;
    if (admins.length <= 1) throw unprocessable("LAST_ADMIN", LAST_ADMIN_MSG);
  }
  await tx.member.update({ where: { id: target.id }, data: { role } });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "ROLE_CHANGED",
      actorMemberId: ctx.memberId,
      targetMemberId: target.id,
      changes: { role: { from: target.role, to: role } },
    },
  });
  return dto(role);
}
