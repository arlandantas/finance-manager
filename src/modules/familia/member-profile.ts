import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { normalizeEmail } from "@/lib/auth/email";
import { memberDisplayName, nameKey, RESERVED_NAME_KEYS } from "@/modules/familia/display-name";
import { convitesRepo } from "@/modules/familia/invitations/repo";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import type {
  UpdateUnlinkedMemberInput,
  UpdateUnlinkedMemberResponse,
} from "@/modules/familia/schemas";
import { scrubIdempotencyMentioning } from "@/modules/privacidade/delete-account";

const EMAIL_TAKEN_MSG = "Este e-mail já pertence a outro membro";

/**
 * US-095 (ADR-038 §5): edita nome e/ou e-mail do cadastro SEM conta. Só ADMIN, sob o lock da família. Nada
 * financeiro é regravado: o nome é resolvido na leitura. O evento guarda só flags (nunca nome nem e-mail).
 */
export async function updateUnlinkedMember(
  tx: Tx,
  ctx: RequestContext,
  memberId: string,
  input: UpdateUnlinkedMemberInput,
): Promise<UpdateUnlinkedMemberResponse> {
  await lockFamilyAdmins(tx, ctx, true);
  const now = ctx.clock.now();
  const active = await tx.member.findMany({
    where: { familyId: ctx.familyId, removedAt: null },
    include: { user: true },
  });
  const target = active.find((m) => m.id === memberId);
  if (!target) throw notFound("Membro não encontrado.");
  if (target.userId !== null) {
    throw conflict("MEMBER_IS_LINKED", "Só a própria pessoa altera o nome");
  }

  const current = memberDisplayName(target);
  let name = current;
  if (input.name !== undefined) {
    const key = nameKey(input.name);
    if (RESERVED_NAME_KEYS.has(key)) throw unprocessable("NAME_RESERVED", "Escolha outro nome");
    if (active.some((m) => m.id !== memberId && nameKey(memberDisplayName(m)) === key)) {
      throw conflict("NAME_TAKEN", "Já existe um membro com este nome");
    }
    name = input.name;
  }

  const oldEmail = target.pendingEmail;
  let email = oldEmail;
  if (input.email !== undefined) {
    const next = input.email === null ? null : normalizeEmail(input.email);
    if (next !== oldEmail) {
      const repo = convitesRepo(tx, ctx.familyId);
      if (oldEmail) await repo.expireStale(oldEmail, now);
      const pendingOwn = await tx.invitation.count({
        where: {
          familyId: ctx.familyId,
          memberId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      });
      if (pendingOwn > 0) {
        throw conflict("MEMBER_HAS_PENDING_INVITATION", "Cancele o convite antes");
      }
      if (next) {
        if (active.some((m) => m.user?.email === next)) {
          throw conflict("DUPLICATE_MEMBER", EMAIL_TAKEN_MSG);
        }
        if (active.some((m) => m.id !== memberId && m.pendingEmail === next)) {
          throw conflict("EMAIL_BELONGS_TO_OTHER_MEMBER", EMAIL_TAKEN_MSG);
        }
        await repo.expireStale(next, now);
        const common = await tx.invitation.count({
          where: { familyId: ctx.familyId, email: next, status: "PENDING", expiresAt: { gt: now } },
        });
        if (common > 0) {
          throw conflict(
            "EMAIL_HAS_PENDING_INVITATION",
            "Já existe um convite pendente para este e-mail. Cancele-o antes.",
          );
        }
      }
      email = next;
    }
  }

  const nameChanged = name !== current;
  const emailChanged = email !== oldEmail;
  if (nameChanged || emailChanged) {
    try {
      await tx.member.update({
        where: { id: memberId },
        data: {
          ...(nameChanged ? { name } : {}),
          ...(emailChanged ? { pendingEmail: email } : {}),
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict("EMAIL_BELONGS_TO_OTHER_MEMBER", EMAIL_TAKEN_MSG);
      throw e;
    }
    if (emailChanged && oldEmail) {
      await tx.$executeRaw`UPDATE invitations SET email = ${`deleted+${memberId}@invalid.local`}
        WHERE "memberId" = ${memberId}::uuid AND status <> 'PENDING'`;
      await scrubIdempotencyMentioning(tx, { identifiers: [oldEmail] });
    }
    await tx.familyEvent.create({
      data: {
        familyId: ctx.familyId,
        type: "MEMBER_UPDATED",
        actorMemberId: ctx.memberId,
        targetMemberId: memberId,
        changes: { nameChanged, emailChanged, hasEmail: email !== null },
      },
    });
  }
  return {
    member: {
      memberId,
      name,
      email: null,
      pendingEmail: email,
      image: null,
      role: "MEMBER",
      joinedAt: target.joinedAt.toISOString(),
      unlinked: true,
      canChangeRole: false,
    },
  };
}
