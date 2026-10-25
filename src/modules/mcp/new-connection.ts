import type { RequestContext, Tx } from "@/lib/api/types";

import { logger } from "@/lib/logger";
import { getMailer } from "@/lib/mail";
import { issuerOf } from "@/modules/mcp/config";
import { mcpDb } from "@/modules/mcp/repo";

// SEC-011 / U4 (SDD-028 §4.4): aviso de conexão nova — cartão na Home (até ser dispensado) e e-mail ao membro.
// Sem dados financeiros.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WHEN = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function newConnectionEmail(a: { label: string; at: Date; manageUrl: string }) {
  const when = WHEN.format(a.at).replace(",", "");
  const subject = "Nova conexão de assistente na sua conta";
  const text = [
    "Olá!",
    "",
    `Uma conexão de assistente (${a.label}) foi criada na sua conta em ${when}.`,
    "Se não foi você, revogue agora em Família > Assistente de IA:",
    a.manageUrl,
  ].join("\n");
  const html = [
    "<p>Olá!</p>",
    `<p>Uma conexão de assistente (<strong>${escapeHtml(a.label)}</strong>) foi criada na sua conta em ${escapeHtml(when)}.</p>`,
    `<p>Se não foi você, <a href="${escapeHtml(a.manageUrl)}">revogue agora</a>.</p>`,
  ].join("\n");
  return { subject, text, html };
}

/** E-mail depois do commit, melhor esforço (falha só vira log). */
export async function notifyNewConnection(
  ctx: Pick<RequestContext, "userId" | "email" | "clock">,
  grantId: string,
): Promise<void> {
  try {
    const grant = await mcpDb().mcpGrant.findUnique({
      where: { id: grantId },
      select: { label: true, createdAt: true },
    });
    if (!grant) return;
    await getMailer().send({
      to: ctx.email,
      ...newConnectionEmail({
        label: grant.label,
        at: grant.createdAt,
        manageUrl: `${issuerOf()}/configuracoes/assistente`,
      }),
    });
  } catch (e) {
    logger.warn({
      event: "mcp_new_connection_mail_failed",
      err: e instanceof Error ? e.name : "erro",
    });
  }
}

export type NewConnectionNoticeDTO = {
  items: Array<{ id: string; label: string; createdAt: string }>;
};

/** Conexões do PRÓPRIO membro ainda não dispensadas (mais novas primeiro, até 3). */
export async function listNewConnectionNotices(
  tx: Tx,
  ctx: RequestContext,
): Promise<NewConnectionNoticeDTO> {
  const rows = await tx.mcpGrant.findMany({
    where: {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      status: "ACTIVE",
      noticeDismissedAt: null,
      expiresAt: { gt: ctx.clock.now() },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: { id: true, label: true, createdAt: true },
  });
  return {
    items: rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt.toISOString() })),
  };
}

export async function dismissNewConnectionNotice(
  tx: Tx,
  ctx: RequestContext,
  grantId: string,
): Promise<NewConnectionNoticeDTO> {
  await tx.mcpGrant.updateMany({
    where: { id: grantId, familyId: ctx.familyId, memberId: ctx.memberId, noticeDismissedAt: null },
    data: { noticeDismissedAt: ctx.clock.now() },
  });
  return listNewConnectionNotices(tx, ctx);
}
