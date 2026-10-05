import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { normalizeEmail } from "@/lib/auth/email";
import type { Clock } from "@/lib/clock";
import { publicBaseUrl } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/ids";
import { getMailer } from "@/lib/mail";
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
  withDbTransaction,
} from "@/modules/familia/invitations/repo";
import { findActiveMembership } from "@/modules/familia/repo";
import { toRole } from "@/modules/familia/roles";
import type { CreateInvitationResponse, InvitationDTO } from "@/modules/familia/schemas";

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED";
  expiresAt: Date;
  createdAt: Date;
  invitedByMemberId: string;
};

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
  };
}

async function memberNames(tx: Tx, familyId: string): Promise<(id: string) => string> {
  const members = await convitesRepo(tx, familyId).members();
  const map = new Map(members.map((m) => [m.id, m.user.name ?? localPart(m.user.email)] as const));
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

  await repo.expireStale(email, now); // libera reconvite após vencer
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

// ── Vínculo no login (SDD-003 §5.4) ──
export type AcceptResult =
  | { status: "JOINED"; familyName: string }
  | { status: "NONE" }
  | { status: "EXPIRED" };

/**
 * Vincula o usuário ao convite pendente do seu e-mail verificado. Idempotente: roda no gate do app
 * e cobre os dois caminhos (com ou sem clicar no link). Convite cancelado cai em `NONE`.
 */
export async function acceptPendingInvitation(
  user: { id: string; email: string; emailVerified: Date | null },
  clock: Clock,
): Promise<AcceptResult> {
  if (!user.emailVerified) return { status: "NONE" };
  const email = normalizeEmail(user.email);
  const now = clock.now();
  try {
    return await withDbTransaction(async (tx): Promise<AcceptResult> => {
      if (await findActiveMembership(user.id, tx)) return { status: "NONE" };
      const invitation = await loginInvitations.findValid(tx, email, now);
      if (invitation) {
        await loginInvitations.insertMember(tx, {
          familyId: invitation.familyId,
          userId: user.id,
          role: invitation.role,
          joinedAt: now,
        });
        await loginInvitations.accept(tx, { id: invitation.id, userId: user.id, now });
        return { status: "JOINED", familyName: invitation.family.name };
      }
      const windowStart = new Date(now.getTime() - EXPIRED_NOTICE_DAYS * DAY_MS);
      return (await loginInvitations.hasExpired(tx, email, now, windowStart))
        ? { status: "EXPIRED" }
        : { status: "NONE" };
    });
  } catch (e) {
    // Corrida: outra aba já vinculou este usuário (UNIQUE Member.userId).
    if (isUniqueViolation(e)) return { status: "NONE" };
    throw e;
  }
}

// ── Página /convite/[token] (SDD-003 §5.5) ──
export type InvitePreview =
  | { state: "INVALID" }
  | { state: "EXPIRED" }
  | { state: "ACCEPTED" }
  | { state: "NEEDS_LOGIN"; familyName: string; inviterName: string; email: string }
  | { state: "WRONG_EMAIL"; familyName: string; inviterName: string; email: string }
  | { state: "READY"; familyName: string; inviterName: string; email: string };

export async function previewInvitation(
  token: string,
  sessionUser: { email: string } | null,
  clock: Clock,
): Promise<InvitePreview> {
  const db = readDb();
  const invitation = await loginInvitations.findByTokenHash(db, sha256Hex(token));
  if (!invitation || invitation.status === "CANCELED") return { state: "INVALID" };
  if (invitation.status === "ACCEPTED") return { state: "ACCEPTED" };
  const expired =
    invitation.status === "EXPIRED" || invitation.expiresAt.getTime() <= clock.now().getTime();
  if (expired) return { state: "EXPIRED" };
  const info = {
    familyName: invitation.family.name,
    inviterName: await loginInvitations.memberName(db, invitation.invitedByMemberId),
    email: invitation.email,
  };
  if (!sessionUser) return { state: "NEEDS_LOGIN", ...info };
  return normalizeEmail(sessionUser.email) === invitation.email
    ? { state: "READY", ...info }
    : { state: "WRONG_EMAIL", ...info };
}
