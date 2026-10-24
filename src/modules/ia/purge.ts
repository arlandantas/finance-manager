import type { PrismaClient } from "@/generated/prisma/client";

/** Retenção padrão dos dados de IA (TL-25): 24 meses. */
export const AI_RETENTION_MONTHS = 24;

function cutoffFor(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

/** Apaga eventos de consumo de LLM mais antigos que N meses. Idempotente. */
export async function purgeLlmUsage(
  db: Pick<PrismaClient, "llmUsageEvent">,
  now: Date,
  months = AI_RETENTION_MONTHS,
): Promise<number> {
  const r = await db.llmUsageEvent.deleteMany({
    where: { createdAt: { lt: cutoffFor(now, months) } },
  });
  return r.count;
}

/** Apaga análises de gastos mais antigas que N meses (US-073). Idempotente. */
export async function purgeSpendingAnalyses(
  db: Pick<PrismaClient, "spendingAnalysis">,
  now: Date,
  months = AI_RETENTION_MONTHS,
): Promise<number> {
  const r = await db.spendingAnalysis.deleteMany({
    where: { createdAt: { lt: cutoffFor(now, months) } },
  });
  return r.count;
}
