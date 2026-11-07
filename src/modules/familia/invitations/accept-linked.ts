import { isUniqueViolation } from "@/lib/api/db-errors";
import { ApiError, conflict, unprocessable } from "@/lib/api/errors";
import type { Tx, UserContext } from "@/lib/api/types";
import { normalizeEmail } from "@/lib/auth/email";
import { sha256Hex } from "@/lib/ids";
import { getMailer } from "@/lib/mail";
import {
  memberDisplayName,
  nameKey,
  RESERVED_NAME_KEYS,
  sanitizeMemberName,
} from "@/modules/familia/display-name";
import { MAIL_SEND_TIMEOUT_MS } from "@/modules/familia/invitations/constants";
import { memberLinkedEmail } from "@/modules/familia/invitations/email";
import { loginInvitations } from "@/modules/familia/invitations/repo";
import type {
  AcceptInvitationResponse,
  MyInvitationDTO,
  MyInvitationsResponse,
} from "@/modules/familia/invitations/schemas";
import {
  ALREADY_IN_FAMILY,
  acceptInvitation,
  assertStillPending,
  listMyInvitations,
  ownInvitation,
  withTimeout,
} from "@/modules/familia/invitations/service";
import { findActiveMembership } from "@/modules/familia/repo";
import { toRole } from "@/modules/familia/roles";

type Ctx = Pick<UserContext, "userId" | "email" | "clock">;
const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
const nameErr = (message: string) => [{ path: "name", message }];

/** Prévia do ADR-038 §4: só contagens (nunca valores, descrições nem nomes de terceiros). */
async function previewOf(tx: Tx, memberId: string, familyId: string, userId: string) {
  const m = await tx.member.findFirst({
    where: { id: memberId, familyId },
    select: { name: true },
  });
  const [accounts, cards, transactions, planned, before] = await Promise.all([
    tx.bankAccount.count({ where: { familyId, ownerMemberId: memberId, archivedAt: null } }),
    tx.creditCard.count({ where: { familyId, ownerMemberId: memberId, archivedAt: null } }),
    tx.transaction.count({
      where: {
        familyId,
        payerMemberId: memberId,
        deletedAt: null,
        kind: { in: ["EXPENSE", "INCOME"] },
      },
    }),
    tx.plannedExpense.count({
      where: { familyId, responsibleMemberId: memberId, status: "PREVISTO", deletedAt: null },
    }),
    tx.member.count({ where: { familyId, userId, removedAt: { not: null } } }),
  ]);
  return {
    label: clip(m?.name ?? ""),
    accounts,
    cards,
    transactions,
    planned,
    wasMemberBefore: before > 0,
  };
}

/** GET /me/invitations: a lista comum + `linked` nos convites vinculados (só do e-mail verificado). */
export async function listMyInvitationsWithPreview(
  tx: Tx,
  ctx: Ctx,
): Promise<MyInvitationsResponse> {
  const base = await listMyInvitations(tx, ctx);
  if (base.invitations.length === 0) return base;
  const rows = await tx.invitation.findMany({
    where: { id: { in: base.invitations.map((i) => i.id) }, memberId: { not: null } },
    select: { id: true, familyId: true, memberId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const out: MyInvitationDTO[] = [];
  for (const inv of base.invitations) {
    const r = byId.get(inv.id);
    out.push(
      r?.memberId
        ? { ...inv, linked: await previewOf(tx, r.memberId, r.familyId, ctx.userId) }
        : inv,
    );
  }
  return { invitations: out };
}

type Accepted = { body: AcceptInvitationResponse; afterCommit?: () => Promise<undefined> };

/**
 * POST /me/invitations/{id}/accept. Convite comum: fluxo atual. Convite vinculado a um cadastro (ADR-038 §2):
 * advisory lock da família antes de qualquer checagem (o `memberId` do convite é imutável, ler antes é seguro).
 */
export async function acceptMyInvitation(
  tx: Tx,
  ctx: Ctx,
  id: string,
  input: { token?: string | undefined; name?: string | undefined },
): Promise<Accepted> {
  const probe = await tx.invitation.findFirst({
    where: { id, email: normalizeEmail(ctx.email) },
    select: { familyId: true, memberId: true },
  });
  if (!probe?.memberId) return { body: await acceptInvitation(tx, ctx, id, input) };
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`family:${probe.familyId}`}, 0))`;
  return acceptLinkedInvitation(tx, ctx, id, probe.memberId, input);
}

async function acceptLinkedInvitation(
  tx: Tx,
  ctx: Ctx,
  id: string,
  memberId: string,
  input: { token?: string | undefined; name?: string | undefined },
): Promise<Accepted> {
  const now = ctx.clock.now();
  const user = await tx.user.findUnique({
    where: { id: ctx.userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Confirme seu e-mail Google para aceitar.");
  }
  const inv = await ownInvitation(tx, ctx, id);
  if (input.token && sha256Hex(input.token) !== inv.tokenHash) {
    throw unprocessable("INVITATION_TOKEN_MISMATCH", "O link não corresponde a este convite.");
  }
  assertStillPending(inv, now);
  if (await findActiveMembership(ctx.userId, tx)) {
    throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
  }

  const { name, nameChanged } = await chosenName(tx, inv.familyId, memberId, input.name);
  const claimed = await loginInvitations.claim(tx, { id, userId: ctx.userId, now });
  if (claimed === 0) {
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais disponível");
  }

  await tx.$executeRaw`SELECT set_config('app.link_member', ${memberId}, true)`;
  let updated: number;
  try {
    updated = await tx.$executeRaw`
      UPDATE members SET "userId" = ${ctx.userId}::uuid, "linkedAt" = ${now}, "pendingEmail" = NULL, name = ${name}
      WHERE id = ${memberId}::uuid AND "familyId" = ${inv.familyId}::uuid
        AND "userId" IS NULL AND "removedAt" IS NULL`;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
    throw e;
  }
  if (updated === 0) {
    throw conflict("MEMBER_NO_LONGER_AVAILABLE", "Este cadastro não está mais disponível.");
  }
  // sem nome nem e-mail no evento (LGPD)
  await tx.familyEvent.create({
    data: {
      familyId: inv.familyId,
      type: "MEMBER_LINKED",
      actorMemberId: memberId,
      targetMemberId: memberId,
      changes: { invitationId: inv.id, nameChanged },
    },
  });
  const admins = await tx.member.findMany({
    where: { familyId: inv.familyId, role: "ADMIN", removedAt: null, userId: { not: null } },
    select: { user: { select: { email: true } } },
  });
  const mails = admins.flatMap((a) =>
    a.user
      ? [{ to: a.user.email, ...memberLinkedEmail({ name, familyName: inv.family.name }) }]
      : [],
  );
  return {
    body: {
      membership: { familyId: inv.familyId, familyName: inv.family.name, role: toRole(inv.role) },
    },
    afterCommit: async () => {
      // falha de e-mail nunca desfaz o vínculo
      await Promise.allSettled(
        mails.map((m) => withTimeout(getMailer().send(m), MAIL_SEND_TIMEOUT_MS)),
      );
      return undefined;
    },
  };
}

/** Nome escolhido (ADR-038 §3): obrigatório, saneado, 2..60, não reservado, único entre ativos (exceto o cadastro). */
async function chosenName(
  tx: Tx,
  familyId: string,
  memberId: string,
  raw: string | undefined,
): Promise<{ name: string; nameChanged: boolean }> {
  if (raw === undefined) {
    throw unprocessable(
      "NAME_REQUIRED",
      "Informe seu nome na família",
      nameErr("Informe seu nome"),
    );
  }
  const name = sanitizeMemberName(raw);
  if (name.length < 2 || name.length > 60) {
    throw unprocessable(
      "NAME_INVALID",
      "Use de 2 a 60 caracteres",
      nameErr("Use de 2 a 60 caracteres"),
    );
  }
  const key = nameKey(name);
  if (RESERVED_NAME_KEYS.has(key)) {
    throw unprocessable("NAME_RESERVED", "Escolha outro nome", nameErr("Escolha outro nome"));
  }
  const active = await tx.member.findMany({
    where: { familyId, removedAt: null },
    include: { user: true },
  });
  if (active.some((m) => m.id !== memberId && nameKey(memberDisplayName(m)) === key)) {
    throw conflict(
      "NAME_TAKEN",
      "Já existe um membro com este nome",
      nameErr("Já existe um membro com este nome"),
    );
  }
  const own = active.find((m) => m.id === memberId);
  return { name, nameChanged: own?.name !== name };
}
