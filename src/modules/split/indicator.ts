import type { RequestContext, Tx } from "@/lib/api/types";
import { periodFromKey, previousPeriod } from "@/lib/period";
import { pendingSettlementMonths } from "@/modules/split/pending";
import { splitRepo } from "@/modules/split/repo";
import type { SettlementIndicatorDTO } from "@/modules/split/schemas";
import { loadSettlement } from "@/modules/split/service";

export const HOME_WINDOW_MONTHS = 12;

/**
 * Indicador da Home (SDD-011 §4.2): `current` vem do mesmo `loadSettlement` do painel (fonte única,
 * nunca diverge); `previous` olha só os 12 meses imediatamente anteriores ao corrente.
 */
export async function getSettlementIndicator(
  tx: Tx,
  ctx: RequestContext,
  currentKey: string,
): Promise<SettlementIndicatorDTO> {
  const cur = await loadSettlement(tx, ctx, currentKey);
  const total = cur.result.suggestions.reduce((s, x) => s + x.amountInCents, 0);
  const status = cur.result.status;
  const current: SettlementIndicatorDTO["current"] =
    status === "PENDING"
      ? { periodKey: currentKey, state: "PENDING", toSettleInCents: total }
      : status === "BALANCED" || status === "SETTLED"
        ? { periodKey: currentKey, state: "IN_ORDER", toSettleInCents: 0 }
        : null;

  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  let from = previousPeriod(periodFromKey(currentKey, cutDay), cutDay);
  const to = from;
  for (let i = 1; i < HOME_WINDOW_MONTHS; i++) from = previousPeriod(from, cutDay);
  const months = await pendingSettlementMonths(tx, ctx, {
    fromPeriodKey: from.key,
    toPeriodKey: to.key,
    capMonths: HOME_WINDOW_MONTHS,
  });
  const previous =
    months.length > 0
      ? {
          monthsCount: months.length,
          totalInCents: months.reduce((s, m) => s + m.toSettleInCents, 0),
          oldestPeriodKey: months[0]?.periodKey as string,
        }
      : null;
  return { current, previous };
}
