import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { normalizeEmail } from "@/lib/auth/email";
import { publicBaseUrl } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/ids";
import { getMailer } from "@/lib/mail";
import { INVITATION_TTL_DAYS, MAIL_SEND_TIMEOUT_MS } from "@/modules/familia/invitations/constants";
import { invitationEmail } from "@/modules/familia/invitations/email";
import { convitesRepo, setEmailStatus } from "@/modules/familia/invitations/repo";
import {
  assertInvitationQuota,
  assertInviterQuota,
  memberNames,
  toInvitationDTO,
  withTimeout,
} from "@/modules/familia/invitations/service";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import type {
  CreateInvitationResponse,
  CreateLinkedInvitationInput,
} from "@/modules/familia/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_TAKEN_MSG = "Este e-mail já pertence a outro membro";

/**
 * US-094a (ADR-038): convida por e-mail o cadastro sem conta. Tudo sob `lockFamilyAdmins`; as recusas vêm
 * ANTES das cotas (pedido recusado não gasta cota). O e-mail é o mesmo do convite comum: sem nome do cadastro.
 */
export async function createLinkedInvitation(
  tx: Tx,
  ctx: RequestContext,
  memberId: string,
  input: CreateLinkedInvitationInput,
  requestOrigin?: string | null,
): Promise<{
  body: CreateInvitationResponse;
  afterCommit: () => Promise<{ emailStatus: "SENT" | "FAILED" }>;
}> {
  await lockFamilyAdmins(tx, ctx, true);
  const now = ctx.clock.now();
  const repo = convitesRepo(tx, ctx.familyId);
  const target = await tx.member.findFirst({
    where: { id: memberId, familyId: ctx.familyId, removedAt: null, userId: null },
    select: { id: true, pendingEmail: true },
  });
  if (!target) throw notFound("Membro não encontrado.");

  const email = normalizeEmail(input.email);
  await repo.expireStale(email, now);
  if (target.pendingEmail && target.pendingEmail !== email) {
    throw unprocessable(
      "INVITATION_EMAIL_MISMATCH",
      "Este cadastro já tem outro e-mail. Use o e-mail cadastrado.",
    );
  }
  if (await repo.memberWithEmail(email)) throw conflict("DUPLICATE_MEMBER", EMAIL_TAKEN_MSG);
  const otherPending = await tx.member.findFirst({
    where: { familyId: ctx.familyId, removedAt: null, pendingEmail: email, id: { not: memberId } },
    select: { id: true },
  });
  if (otherPending) throw conflict("EMAIL_BELONGS_TO_OTHER_MEMBER", EMAIL_TAKEN_MSG);
  if ((await repo.pendingForEmail(email, now)) > 0) {
    throw conflict("DUPLICATE_INVITATION", "Já existe um convite pendente para este e-mail");
  }

  await assertInvitationQuota(tx, ctx.familyId, now);
  await assertInviterQuota(tx, ctx.userId, now);

  const token = randomToken(32);
  let row: Awaited<ReturnType<typeof repo.insert>>;
  try {
    if (!target.pendingEmail) {
      await tx.member.update({ where: { id: memberId }, data: { pendingEmail: email } });
    }
    row = await repo.insert({
      email,
      role: "MEMBER",
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
      invitedByMemberId: ctx.memberId,
      memberId,
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
    body: { invitation: toInvitationDTO(row, name, now), inviteUrl, emailStatus: "SENT" },
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
