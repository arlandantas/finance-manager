import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { normalizeEmail } from "@/lib/auth/email";
import { memberDisplayName, nameKey, RESERVED_NAME_KEYS } from "@/modules/familia/display-name";
import { convitesRepo } from "@/modules/familia/invitations/repo";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import type {
  CreateUnlinkedMemberInput,
  CreateUnlinkedMemberResponse,
} from "@/modules/familia/schemas";

/** SEC-068: teto de cadastros sem conta ativos por família. */
export const UNLINKED_MEMBER_LIMIT = 20;

const EMAIL_TAKEN_MSG = "Este e-mail já pertence a outro membro";

/**
 * US-092b (SDD-033 §4.2): cadastra um membro SEM conta (só nome e e-mail opcional). Só ADMIN, sob o lock da
 * família: unicidade de nome e e-mail é checada dentro do lock (o índice `members_family_pending_email_uq` é a
 * rede). Não envia e-mail, não consome cota de convite e não cria sessão, consentimento nem concessão.
 */
export async function createUnlinkedMember(
  tx: Tx,
  ctx: RequestContext,
  input: CreateUnlinkedMemberInput,
): Promise<CreateUnlinkedMemberResponse> {
  await lockFamilyAdmins(tx, ctx, true);
  const now = ctx.clock.now();
  const key = nameKey(input.name);
  if (RESERVED_NAME_KEYS.has(key)) {
    throw unprocessable("NAME_RESERVED", "Escolha outro nome");
  }

  const active = await tx.member.findMany({
    where: { familyId: ctx.familyId, removedAt: null },
    include: { user: true },
  });
  if (active.filter((m) => m.userId === null).length >= UNLINKED_MEMBER_LIMIT) {
    throw unprocessable(
      "UNLINKED_MEMBER_LIMIT",
      `A família já tem ${UNLINKED_MEMBER_LIMIT} membros sem acesso ao app.`,
    );
  }
  if (active.some((m) => nameKey(memberDisplayName(m)) === key)) {
    throw conflict("NAME_TAKEN", "Já existe um membro com este nome");
  }

  const email = input.email ? normalizeEmail(input.email) : null;
  if (email) {
    if (active.some((m) => m.user?.email === email)) {
      throw conflict("DUPLICATE_MEMBER", EMAIL_TAKEN_MSG);
    }
    if (active.some((m) => m.pendingEmail === email)) {
      throw conflict("EMAIL_BELONGS_TO_OTHER_MEMBER", EMAIL_TAKEN_MSG);
    }
    const repo = convitesRepo(tx, ctx.familyId);
    await repo.expireStale(email, now); // convite vencido libera o cadastro (vira EXPIRED)
    const pending = await tx.invitation.count({
      where: { familyId: ctx.familyId, email, status: "PENDING", expiresAt: { gt: now } },
    });
    if (pending > 0) {
      throw conflict(
        "EMAIL_HAS_PENDING_INVITATION",
        "Já existe um convite pendente para este e-mail. Cancele-o antes de cadastrar.",
      );
    }
  }

  let row: Awaited<ReturnType<typeof tx.member.create>>;
  try {
    row = await tx.member.create({
      data: {
        familyId: ctx.familyId,
        userId: null,
        role: "MEMBER",
        joinedAt: now,
        name: input.name,
        pendingEmail: email,
        createdByMemberId: ctx.memberId,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("EMAIL_BELONGS_TO_OTHER_MEMBER", EMAIL_TAKEN_MSG);
    throw e;
  }
  // PII de terceiro: o evento guarda só se havia e-mail, nunca nome nem e-mail (D-033-9).
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "MEMBER_CREATED",
      actorMemberId: ctx.memberId,
      targetMemberId: row.id,
      changes: { hasEmail: email !== null },
    },
  });
  return {
    member: {
      memberId: row.id,
      name: input.name,
      email: null, // e-mail de conta: não há; o pendente vai só em `pendingEmail` (ator é ADMIN)
      pendingEmail: email,
      image: null,
      role: "MEMBER",
      joinedAt: row.joinedAt.toISOString(),
      unlinked: true,
      canChangeRole: false,
    },
  };
}
