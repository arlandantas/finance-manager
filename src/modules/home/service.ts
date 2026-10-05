import { badRequest } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { apportion } from "@/lib/apportion";
import { todayInFamilyTz } from "@/lib/dates";
import { type Period, periodFromKey, periodOf } from "@/lib/period";
import { listAccounts } from "@/modules/contas/service";
import { homeRepo } from "@/modules/home/repo";
import type { HomeDTO, MonthSummaryDTO } from "@/modules/home/schemas";
import { listDueItems } from "@/modules/previstas/payables";
import { splitRepo } from "@/modules/split/repo";
import { loadSettlement, toSettlementDto } from "@/modules/split/service";
import { familyHasTransactions, ledgerTotals } from "@/modules/transacoes/extrato";
import { listTransactions, memberRefOf } from "@/modules/transacoes/service";

const MAX_FUTURE_MONTHS = 12;

/** Chave do último período aceito: o corrente + 12 meses. */
function maxPeriodKey(current: Period): string {
  const [y, m] = current.key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + MAX_FUTURE_MONTHS;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * Resumo do Mês (SDD-010 §4.2). Reaproveita `ledgerTotals`/`paidByMember` do Extrato: não reimplementa
 * soma. Roda dentro de transação `REPEATABLE READ` (um instantâneo).
 */
export async function getMonthSummary(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<MonthSummaryDTO> {
  const split = splitRepo(tx, ctx.familyId);
  const cutDay = await split.cutDay();
  const today = todayInFamilyTz(ctx.clock);
  const currentPeriod = periodOf(today, cutDay);
  if (periodKey && periodKey > maxPeriodKey(currentPeriod)) {
    throw badRequest("PERIOD_OUT_OF_RANGE", "Período além de 12 meses à frente.");
  }
  const period = periodKey ? periodFromKey(periodKey, cutDay) : currentPeriod;
  const isCurrent = period.key === currentPeriod.key;
  const isFuture = period.key > currentPeriod.key;
  const { start, end } = period;

  const totals = await ledgerTotals(tx, {
    familyId: ctx.familyId,
    start,
    end,
    includeDeleted: false,
  });
  const paid = await homeRepo(tx, ctx.familyId).paidByMember(start, end);
  const members = await split.listMembers();
  const withPaid = members.map((m, i) => ({
    ref: memberRefOf(m),
    id: m.id,
    ordinal: i,
    paid: paid.get(m.id) ?? 0,
  }));
  const totalPaid = withPaid.reduce((s, m) => s + m.paid, 0);
  const shares =
    totalPaid > 0
      ? apportion(
          100,
          withPaid.map((m) => ({ key: m.id, weight: m.paid, ordinal: m.ordinal })),
        )
      : {};

  const due = await listDueItems(tx, ctx, { period, isCurrent, today });
  const accounts = await listAccounts(tx, ctx);
  const toPayTotal = due.plannedInCents + due.invoicesInCents;
  return {
    period: { key: period.key, start, end, isCurrent, isFuture },
    incomeInCents: totals.incomeInCents,
    expenseInCents: totals.expenseInCents,
    resultInCents: totals.incomeInCents - totals.expenseInCents,
    toPay: {
      totalInCents: toPayTotal,
      plannedInCents: due.plannedInCents,
      invoicesInCents: due.invoicesInCents,
      overdueInCents: due.overdueInCents,
      overdueCount: due.overdueCount,
      items: due.items.slice(0, 5),
      totalCount: due.items.length,
    },
    currentBalanceInCents: accounts.totalBalanceInCents,
    projectedBalanceInCents: accounts.totalBalanceInCents - toPayTotal,
    byMember: withPaid.map((m) => ({
      member: m.ref,
      paidInCents: m.paid,
      sharePercent: shares[m.id] ?? 0,
    })),
    isEmpty: totals.incomeInCents === 0 && totals.expenseInCents === 0 && due.items.length === 0,
  };
}

/** GET /api/v1/home (SDD-010 §2). Chamado dentro de transação REPEATABLE READ (um instantâneo). */
export async function getHome(tx: Tx, ctx: RequestContext, periodKey?: string): Promise<HomeDTO> {
  const monthSummary = await getMonthSummary(tx, ctx, periodKey);
  const accounts = await listAccounts(tx, ctx);
  const loaded = await loadSettlement(tx, ctx, periodKey);
  const settlement = toSettlementDto(loaded, ctx);
  const recent = await listTransactions(tx, ctx, {
    from: "1970-01-01",
    to: "2999-12-31",
    limit: 5,
  });
  const hasTransaction = await familyHasTransactions(tx, ctx.familyId);
  const hasAccount = accounts.items.length > 0;
  return {
    period: {
      key: monthSummary.period.key,
      start: monthSummary.period.start,
      end: monthSummary.period.end,
    },
    monthSummary,
    balances: { totalInCents: accounts.totalBalanceInCents, accounts: accounts.items },
    settlement: {
      period: settlement.period,
      status: settlement.status,
      suggestions: settlement.suggestions,
      rule: settlement.rule,
    },
    recent: recent.items,
    onboarding: {
      hasAccount,
      hasOtherMember: loaded.members.length > 1,
      hasTransaction,
      showChecklist: !hasAccount && !hasTransaction,
    },
    memberCount: loaded.members.length,
  };
}
