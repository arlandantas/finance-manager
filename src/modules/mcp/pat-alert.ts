import type { PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { getMailer } from "@/lib/mail";
import { issuerOf } from "@/modules/mcp/config";
import type { McpContext } from "@/modules/mcp/context";
import { hit } from "@/modules/mcp/rate-limit";

// US-074c (ADR-043 §11): e-mail ao membro quando um token pessoal bate limite, no máx. 1 por token por dia.
// Sem token, valores nem descrições; só o nome que o próprio membro deu ao token e o link para revogar.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function patAlertEmail(a: { label: string; manageUrl: string }) {
  const subject = "Seu token pessoal do assistente atingiu um limite de uso";
  const text = [
    "Olá!",
    "",
    `O token pessoal "${a.label}" atingiu um limite de uso hoje.`,
    "Se não foi você ou um programa seu, revogue agora em Família > Assistente de IA:",
    a.manageUrl,
  ].join("\n");
  const html = [
    "<p>Olá!</p>",
    `<p>O token pessoal <strong>${escapeHtml(a.label)}</strong> atingiu um limite de uso hoje.</p>`,
    `<p>Se não foi você ou um programa seu, <a href="${escapeHtml(a.manageUrl)}">revogue agora</a>.</p>`,
  ].join("\n");
  return { subject, text, html };
}

/** Chamado após o registro do limite (`RATE_LIMITED`/`LIMIT_EXCEEDED`). Só PAT; melhor esforço (falha vira log). */
export async function alertPatLimit(
  db: PrismaClient,
  ctx: Pick<McpContext, "grantId" | "email" | "clock">,
): Promise<void> {
  try {
    const grant = await db.mcpGrant.findUnique({
      where: { id: ctx.grantId },
      select: { kind: true, label: true },
    });
    if (grant?.kind !== "PAT") return;
    const first = await hit(db, `pat-alert:${ctx.grantId}:day`, 1, 86_400, ctx.clock.now());
    if (!first.ok) return;
    await getMailer().send({
      to: ctx.email,
      ...patAlertEmail({
        label: grant.label,
        manageUrl: `${issuerOf()}/configuracoes/assistente`,
      }),
    });
  } catch (e) {
    logger.warn({ event: "mcp_pat_alert_failed", err: e instanceof Error ? e.name : "erro" });
  }
}
