import { isUniqueViolation } from "@/lib/api/db-errors";
import { ApiError, conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx, UserContext } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { normalizeEmail } from "@/lib/auth/email";
import type { Clock } from "@/lib/clock";
import { publicBaseUrl } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/ids";
import { getMailer } from "@/lib/mail";
import { memberDisplayName } from "@/modules/familia/display-name";
import {
  EXPIRED_NOTICE_DAYS,
  INVITATION_TTL_DAYS,
  MAIL_SEND_TIMEOUT_MS,
} from "@/modules/familia/invitations/constants";
import { invitationEmail } from "@/modules/familia/invitations/email";
import {
  convitesRepo,
  loginInvitations,
  readDb,
  setEmailStatus,
} from "@/modules/familia/invitations/repo";
import type {
  AcceptInvitationResponse,
  MyInvitationDTO,
  MyInvitationsResponse,
} from "@/modules/familia/invitations/schemas";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import { findActiveMembership } from "@/modules/familia/repo";
import { toRole } from "@/modules/familia/roles";
import type {
  CreateInvitationResponse,
  InvitationDTO,
  RotatedInvitationResponse,
} from "@/modules/familia/schemas";
import { hit } from "@/modules/mcp/rate-limit";

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED" | "DECLINED";
  expiresAt: Date;
  createdAt: Date;
  invitedByMemberId: string;
  resendCount: number;
};

export const MAX_RESENDS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function toInvitationDTO(
  row: InvitationRow,
  inviterName: (memberId: string) => string,
  now: Date,
): InvitationDTO {
  return {
    id: row.id,
    email: row.email,
    role: toRole(row.role),
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    isExpired: row.status === "PENDING" && row.expiresAt.getTime() <= now.getTime(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: { memberId: row.invitedByMemberId, name: inviterName(row.invitedByMemberId) },
    resendCount: row.resendCount,
    canResend:
      row.status === "PENDING" &&
      row.expiresAt.getTime() > now.getTime() &&
      row.resendCount < MAX_RESENDS,
  };
}

async function memberNames(tx: Tx, familyId: string): Promise<(id: string) => string> {
  const members = await convitesRepo(tx, familyId).members();
  const map = new Map(members.map((m) => [m.id, memberDisplayName(m)] as const));
  return (id) => map.get(id) ?? "Alguém";
}

export async function listPendingInvitations(
  tx: Tx,
  ctx: Pick<RequestContext, "familyId" | "clock">,
): Promise<InvitationDTO[]> {
  const rows = await convitesRepo(tx, ctx.familyId).listPending();
  const name = await memberNames(tx, ctx.familyId);
  return rows.map((r) => toInvitationDTO(r, name, ctx.clock.now()));
}

/** SEC-004: recusas recentes (30 dias) para o Administrador ver "Recusado" (e poder convidar de novo). */
export async function listDeclinedInvitations(
  tx: Tx,
  ctx: Pick<RequestContext, "familyId" | "clock">,
): Promise<InvitationDTO[]> {
  const since = new Date(ctx.clock.now().getTime() - 30 * DAY_MS);
  const rows = await convitesRepo(tx, ctx.familyId).listDeclined(since);
  const name = await memberNames(tx, ctx.familyId);
  return rows.map((r) => toInvitationDTO(r, name, ctx.clock.now()));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout no envio de e-mail")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** SEC-014: teto de convites criados por família (qualquer status) para limitar spam/phishing por e-mail. */
export const INVITES_PER_HOUR = 5;
export const INVITES_PER_DAY = 10;

/**
 * SEC-040: o teto também vale por PESSOA que convida (`userId`), somando todas as famílias que ela criou, inclusive
 * as já excluídas, e conta o reenvio com e-mail (cada envio é uma mensagem com o nome livre do convidante).
 * Balde em `mcp_rate_buckets` (sobrevive à exclusão da família); como roda dentro da transação, o pedido recusado
 * (429) ou revertido não consome cota.
 */
async function assertInviterQuota(tx: Tx, userId: string, now: Date) {
  const hour = await hit(tx, `invite:${userId}:hour`, INVITES_PER_HOUR, 3600, now);
  const day = await hit(tx, `invite:${userId}:day`, INVITES_PER_DAY, 86_400, now);
  if (!hour.ok || !day.ok) throw invitationLimit();
}

const invitationLimit = () =>
  new ApiError(
    429,
    "INVITATION_LIMIT",
    "Você atingiu o limite de convites por período. Tente novamente mais tarde.",
  );

async function assertInvitationQuota(tx: Tx, familyId: string, now: Date) {
  // SEC-027: contagem + insert precisam ser atômicos por família; o lock dura até o fim da transação
  // (que também faz o insert), então pedidos paralelos veem a contagem uns dos outros.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invite-quota:${familyId}`}, 0))`;
  const since = (ms: number) => new Date(now.getTime() - ms);
  const [hour, day] = await Promise.all([
    tx.invitation.count({ where: { familyId, createdAt: { gte: since(3_600_000) } } }),
    tx.invitation.count({ where: { familyId, createdAt: { gte: since(DAY_MS) } } }),
  ]);
  if (hour >= INVITES_PER_HOUR || day >= INVITES_PER_DAY) {
    throw invitationLimit();
  }
}

/**
 * US-003 (SDD-003 §5.2). O e-mail só sai depois do commit (`afterCommit`); falha não desfaz o
 * convite: `emailStatus: "FAILED"` e a UI oferece copiar o link (ADR-012).
 */
export async function createInvitation(
  tx: Tx,
  ctx: RequestContext,
  input: { email: string; role: "ADMIN" | "MEMBER" },
  requestOrigin?: string | null,
): Promise<{
  body: CreateInvitationResponse;
  afterCommit: () => Promise<{ emailStatus: "SENT" | "FAILED" }>;
}> {
  const repo = convitesRepo(tx, ctx.familyId);
  const email = normalizeEmail(input.email);
  const now = ctx.clock.now();

  await lockFamilyAdmins(tx, ctx, true); // US-092b: serializa com o cadastro de membro sem conta
  await repo.expireStale(email, now); // libera reconvite após vencer
  // US-092b: o e-mail de um cadastro sem conta só convida pelo cadastro (094a); sem consumir cota
  const unlinked = (await repo.members()).find(
    (m) => m.userId === null && m.pendingEmail === email,
  );
  if (unlinked) {
    throw conflict(
      "EMAIL_BELONGS_TO_UNLINKED_MEMBER",
      `Este e-mail é do cadastro de ${memberDisplayName(unlinked)}. Convide pelo cadastro dele(a).`,
    );
  }
  await assertInvitationQuota(tx, ctx.familyId, now);
  await assertInviterQuota(tx, ctx.userId, now); // SEC-040
  if (await repo.memberWithEmail(email)) {
    throw conflict("DUPLICATE_MEMBER", "Esta pessoa já faz parte da família");
  }

  const token = randomToken(32);
  let row: Awaited<ReturnType<typeof repo.insert>>;
  try {
    row = await repo.insert({
      email,
      role: input.role,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
      invitedByMemberId: ctx.memberId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict("DUPLICATE_INVITATION", "Já existe um convite pendente para este e-mail");
    }
    throw e;
  }

  const [family, name] = await Promise.all([repo.family(), memberNames(tx, ctx.familyId)]);
  const inviteUrl = `${publicBaseUrl(undefined, requestOrigin)}/convite/${token}`;
  const message = {
    to: email,
    ...invitationEmail({
      inviterName: name(ctx.memberId),
      familyName: family?.name ?? "família",
      inviteUrl,
      email,
    }),
  };

  return {
    body: {
      invitation: toInvitationDTO(row, name, now),
      inviteUrl,
      emailStatus: "SENT",
    },
    afterCommit: async () => {
      let emailStatus: "SENT" | "FAILED" = "SENT";
      try {
        await withTimeout(getMailer().send(message), MAIL_SEND_TIMEOUT_MS);
      } catch {
        emailStatus = "FAILED";
      }
      await setEmailStatus(row.id, emailStatus).catch(() => {});
      return { emailStatus };
    },
  };
}

/**
 * US-039 (SDD-013 §4.3): "Copiar link" e "Reenviar e-mail" ROTACIONAM o token (só o hash é guardado):
 * o link anterior deixa de valer; a validade original não é estendida. O reenvio conta (máx. 3).
 */
export async function rotateInvitation(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  opts: { sendEmail: boolean },
  requestOrigin?: string | null,
): Promise<{
  body: RotatedInvitationResponse;
  afterCommit?: () => Promise<{ emailStatus: "SENT" | "FAILED" }>;
}> {
  const now = ctx.clock.now();
  const rows = await tx.$queryRaw<
    Array<{ id: string; email: string; status: string; expiresAt: Date; resendCount: number }>
  >`SELECT id, email, status, "expiresAt", "resendCount" FROM invitations
    WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid FOR UPDATE`;
  const inv = rows[0];
  if (!inv) throw notFound("Convite não encontrado.");
  if (inv.status !== "PENDING") {
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais pendente");
  }
  if (inv.expiresAt.getTime() <= now.getTime()) {
    throw unprocessable("INVITATION_EXPIRED", "Convite expirado. Cancele e crie um novo convite.");
  }
  if (opts.sendEmail && inv.resendCount >= MAX_RESENDS) {
    throw unprocessable(
      "RESEND_LIMIT_REACHED",
      "Limite de reenvios atingido. Cancele e crie um novo convite.",
    );
  }
  if (opts.sendEmail) await assertInviterQuota(tx, ctx.userId, now); // SEC-040: reenvio também conta
  const token = randomToken(32);
  const row = await tx.invitation.update({
    where: { id },
    data: {
      tokenHash: sha256Hex(token),
      lastSentAt: now,
      ...(opts.sendEmail ? { resendCount: { increment: 1 } } : {}),
    },
  });
  if (opts.sendEmail) {
    await tx.familyEvent.create({
      data: {
        familyId: ctx.familyId,
        type: "INVITATION_RESENT",
        actorMemberId: ctx.memberId,
        changes: { email: inv.email, resendCount: row.resendCount },
      },
    });
  }
  const repo = convitesRepo(tx, ctx.familyId);
  const [family, name] = await Promise.all([repo.family(), memberNames(tx, ctx.familyId)]);
  const inviteUrl = `${publicBaseUrl(undefined, requestOrigin)}/convite/${token}`;
  const body: RotatedInvitationResponse = {
    invitation: toInvitationDTO(row, name, now),
    inviteUrl,
  };
  if (!opts.sendEmail) return { body };
  const message = {
    to: inv.email,
    ...invitationEmail({
      inviterName: name(ctx.memberId),
      familyName: family?.name ?? "família",
      inviteUrl,
      email: inv.email,
    }),
  };
  return {
    body: { ...body, emailStatus: "SENT" },
    afterCommit: async () => {
      let emailStatus: "SENT" | "FAILED" = "SENT";
      try {
        await withTimeout(getMailer().send(message), MAIL_SEND_TIMEOUT_MS);
      } catch {
        emailStatus = "FAILED";
      }
      return { emailStatus };
    },
  };
}

export async function cancelInvitation(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ invitation: InvitationDTO }> {
  const repo = convitesRepo(tx, ctx.familyId);
  const found = await repo.findById(id);
  if (!found) throw notFound("Convite não encontrado.");
  if (found.status !== "PENDING") {
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais pendente");
  }
  const updated = await repo.cancel(id, ctx.clock.now());
  const name = await memberNames(tx, ctx.familyId);
  return { invitation: toInvitationDTO(updated, name, ctx.clock.now()) };
}

// ── Aceite explícito (SEC-004, SDD-028 §1) ──
// O vínculo NUNCA acontece no login, no gate ou ao abrir o link: só em `acceptInvitation` (mutação).

/** Estado do convite para o gate de entrada (só leitura, sem efeito colateral). */
export async function invitationGateState(
  user: { email: string; emailVerified: Date | null },
  clock: Clock,
): Promise<{ valid: number; expired: boolean }> {
  if (!user.emailVerified) return { valid: 0, expired: false };
  const db = readDb();
  const email = normalizeEmail(user.email);
  const now = clock.now();
  const valid = await loginInvitations.countValid(db, email, now);
  if (valid > 0) return { valid, expired: false };
  const windowStart = new Date(now.getTime() - EXPIRED_NOTICE_DAYS * DAY_MS);
  return { valid: 0, expired: await loginInvitations.hasExpired(db, email, now, windowStart) };
}

const MAX_NAME = 60;
const clip = (s: string) => (s.length > MAX_NAME ? `${s.slice(0, MAX_NAME - 1)}…` : s);

/** GET /me/invitations: só convites PENDING e não vencidos do e-mail verificado (vazio se não verificado). */
export async function listMyInvitations(
  tx: Tx,
  ctx: Pick<UserContext, "userId" | "email" | "clock">,
): Promise<MyInvitationsResponse> {
  const user = await tx.user.findUnique({
    where: { id: ctx.userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) return { invitations: [] };
  const rows = await loginInvitations.listValid(tx, normalizeEmail(ctx.email), ctx.clock.now());
  const out: MyInvitationDTO[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      familyName: clip(r.family.name),
      inviterName: clip(await loginInvitations.memberName(tx, r.invitedByMemberId)),
      role: toRole(r.role),
      expiresAt: r.expiresAt.toISOString(),
    });
  }
  return { invitations: out };
}

type MyInvitationRow = NonNullable<Awaited<ReturnType<typeof loginInvitations.findOwn>>>;

/** Convite do e-mail da sessão; de outro e-mail ou inexistente => 404 uniforme. */
async function ownInvitation(
  tx: Tx,
  ctx: Pick<UserContext, "email">,
  id: string,
): Promise<MyInvitationRow> {
  const inv = await loginInvitations.findOwn(tx, id, normalizeEmail(ctx.email));
  if (!inv) throw notFound("Convite não encontrado.");
  return inv;
}

function assertStillPending(inv: MyInvitationRow, now: Date) {
  if (inv.status !== "PENDING") {
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais disponível");
  }
  if (inv.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(410, "INVITATION_EXPIRED", "Convite expirado. Peça um novo convite.");
  }
}

const ALREADY_IN_FAMILY = "Você já faz parte de uma família.";

/** POST /me/invitations/{id}/accept. Sem sobrescrita: quem já tem família recebe 409 e o convite segue pendente. */
export async function acceptInvitation(
  tx: Tx,
  ctx: Pick<UserContext, "userId" | "email" | "clock">,
  id: string,
  input: { token?: string | undefined },
): Promise<AcceptInvitationResponse> {
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
  // Concorrência no mesmo convite: UPDATE condicional, contagem 1 vence
  const claimed = await loginInvitations.claim(tx, { id, userId: ctx.userId, now });
  if (claimed === 0) {
    const fresh = await loginInvitations.findOwn(tx, id, normalizeEmail(ctx.email));
    if (fresh) assertStillPending(fresh, now);
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais disponível");
  }
  let member: { id: string };
  try {
    member = await loginInvitations.insertMember(tx, {
      familyId: inv.familyId,
      userId: ctx.userId,
      role: inv.role,
      joinedAt: now,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
    throw e;
  }
  await tx.familyEvent.create({
    data: {
      familyId: inv.familyId,
      type: "MEMBER_JOINED",
      actorMemberId: member.id,
      changes: { invitationId: inv.id, role: inv.role },
    },
  });
  return {
    membership: { familyId: inv.familyId, familyName: inv.family.name, role: toRole(inv.role) },
  };
}

/** POST /me/invitations/{id}/decline: sem vínculo; o Administrador passa a ver "Recusado". */
export async function declineInvitation(
  tx: Tx,
  ctx: Pick<UserContext, "userId" | "email" | "clock">,
  id: string,
): Promise<{ invitation: { id: string; status: "DECLINED" } }> {
  const now = ctx.clock.now();
  const inv = await ownInvitation(tx, ctx, id);
  if (inv.status !== "PENDING") {
    throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais disponível");
  }
  const res = await loginInvitations.decline(tx, { id, userId: ctx.userId, now });
  if (res === 0) throw conflict("INVITATION_NOT_PENDING", "Este convite não está mais disponível");
  return { invitation: { id, status: "DECLINED" } };
}

// ── Página /convite/[token] (SDD-003 §5.5) ──
export type InvitePreview =
  | { state: "INVALID" }
  | { state: "EXPIRED" }
  | { state: "ACCEPTED" }
  | { state: "NEEDS_LOGIN"; familyName: string; inviterName: string; email: string }
  | { state: "WRONG_EMAIL"; familyName: string; inviterName: string; email: string }
  | {
      state: "READY";
      id: string;
      role: "ADMIN" | "MEMBER";
      expiresAt: string;
      familyName: string;
      inviterName: string;
      email: string;
    };

export async function previewInvitation(
  token: string,
  sessionUser: { email: string } | null,
  clock: Clock,
): Promise<InvitePreview> {
  const db = readDb();
  const invitation = await loginInvitations.findByTokenHash(db, sha256Hex(token));
  if (!invitation || invitation.status === "CANCELED" || invitation.status === "DECLINED") {
    return { state: "INVALID" };
  }
  if (invitation.status === "ACCEPTED") return { state: "ACCEPTED" };
  const expired =
    invitation.status === "EXPIRED" || invitation.expiresAt.getTime() <= clock.now().getTime();
  if (expired) return { state: "EXPIRED" };
  const info = {
    familyName: clip(invitation.family.name),
    inviterName: clip(await loginInvitations.memberName(db, invitation.invitedByMemberId)),
    email: invitation.email,
  };
  if (!sessionUser) return { state: "NEEDS_LOGIN", ...info };
  return normalizeEmail(sessionUser.email) === invitation.email
    ? {
        state: "READY",
        id: invitation.id,
        role: toRole(invitation.role),
        expiresAt: invitation.expiresAt.toISOString(),
        ...info,
      }
    : { state: "WRONG_EMAIL", ...info };
}
