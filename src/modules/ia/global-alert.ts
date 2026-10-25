import { getMailer } from "@/lib/mail";
import type { LlmConfig } from "@/modules/ia/config";

type Log = { warn(obj: Record<string, unknown>, msg: string): void };

/**
 * SEC-013 (SDD-028 §5.2): alarme do teto global (50/80/100 %). Só números: log estruturado e e-mail para
 * `OPS_ALERT_EMAIL`. Melhor esforço: falha de e-mail nunca derruba a análise.
 */
export async function notifyGlobalBudget(
  cfg: Pick<LlmConfig, "OPS_ALERT_EMAIL">,
  month: string,
  pct: number,
  log: Log,
): Promise<void> {
  log.warn({ event: "llm_global_budget_threshold", month, pct }, "llm_global_budget_threshold");
  if (!cfg.OPS_ALERT_EMAIL) return;
  const text = `Teto global de IA: ${pct} % do mês ${month} usado.`;
  try {
    await getMailer().send({
      to: cfg.OPS_ALERT_EMAIL,
      subject: `Teto global de IA: ${pct} % do mês ${month}`,
      text,
      html: `<p>${text}</p>`,
    });
  } catch (e) {
    log.warn(
      { event: "llm_global_budget_mail_failed", err: e instanceof Error ? e.name : "erro" },
      "llm_global_budget_mail_failed",
    );
  }
}
