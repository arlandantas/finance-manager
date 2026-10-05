import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { type Period, periodFromKey, periodOf, previousPeriod } from "@/lib/period";
import { splitRepo } from "@/modules/split/repo";
import { loadSettlement } from "@/modules/split/service";

export const MAX_PENDING_MONTHS = 120;

/**
 * Meses com acerto PENDENTE (SDD-011 §4.2), do mais antigo ao mais recente. Mesma fonte do painel:
 * cada mês é calculado por `computeSettlement` (via `loadSettlement`), então nunca diverge dele.
 * Só varre períodos que têm despesa comum; `from` padrão = mês da 1ª despesa dividida (teto 120 meses).
 */
export async function pendingSettlementMonths(
  tx: Tx,
  ctx: RequestContext,
  a: { fromPeriodKey?: string; toPeriodKey: string; capMonths?: number },
): Promise<Array<{ periodKey: string; toSettleInCents: number }>> {
  const repo = splitRepo(tx, ctx.familyId);
  const cutDay = await repo.cutDay();
  const to = periodFromKey(a.toPeriodKey, cutDay);
  let from: Period;
  if (a.fromPeriodKey) from = periodFromKey(a.fromPeriodKey, cutDay);
  else {
    const first = await repo.firstSharedExpenseDate();
    if (!first) return [];
    from = periodOf(fromDbDate(first), cutDay);
  }
  // teto: no máximo `cap` meses para trás a partir de `to`
  const cap = a.capMonths ?? MAX_PENDING_MONTHS;
  const keys: string[] = [];
  let cur = to;
  for (let i = 0; i < cap && cur.key >= from.key; i++) {
    keys.push(cur.key);
    cur = previousPeriod(cur, cutDay);
  }
  keys.reverse();
  const out: Array<{ periodKey: string; toSettleInCents: number }> = [];
  for (const key of keys) {
    const p = periodFromKey(key, cutDay);
    const expenses = await repo.sharedExpenses(p.start, p.end);
    if (expenses.length === 0) continue;
    const l = await loadSettlement(tx, ctx, key);
    const total = l.result.suggestions.reduce((s, x) => s + x.amountInCents, 0);
    if (l.result.status === "PENDING" && total > 0)
      out.push({ periodKey: key, toSettleInCents: total });
  }
  return out;
}
