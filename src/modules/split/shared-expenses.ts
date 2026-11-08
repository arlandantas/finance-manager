import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import { assertSettlementEnabled } from "@/modules/split/guard";
import { loadRuleContext, refsOf } from "@/modules/split/rule-context";
import type { SharedExpensesResponse } from "@/modules/split/schemas";

/** GET /api/v1/settlement/expenses: as despesas comuns que compõem o cálculo (soma = total). */
export async function listSharedExpenses(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<SharedExpensesResponse> {
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const period = periodKey ? periodFromKey(periodKey, c.cutDay) : periodOf(c.today, c.cutDay);
  const rows = await c.repo.sharedExpenses(period.start, period.end);
  const refs = refsOf(c.allMembers);
  const items = rows.map((e) => ({
    id: e.id,
    description: e.description,
    amountInCents: toCents(e.amountInCents),
    occurredOn: fromDbDate(e.occurredOn),
    payer: refs.get(e.payerMemberId as string) ?? {
      id: e.payerMemberId as string,
      name: "Membro",
      image: null,
    },
    category: {
      id: e.category?.id ?? "",
      name: e.category?.name ?? "",
      icon: e.category?.icon ?? "",
    },
    installment:
      e.installmentNo !== null && e.installmentCount !== null
        ? { no: e.installmentNo, count: e.installmentCount }
        : null,
  }));
  return { items, totalInCents: items.reduce((s, i) => s + i.amountInCents, 0) };
}
