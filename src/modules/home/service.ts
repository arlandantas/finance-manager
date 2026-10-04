import type { RequestContext, Tx } from "@/lib/api/types";
import { apportion } from "@/lib/apportion";
import { listAccounts } from "@/modules/contas/service";
import { homeRepo } from "@/modules/home/repo";
import type { HomeDTO } from "@/modules/home/schemas";
import { homePayables } from "@/modules/previstas/payables";
import { loadSettlement, toSettlementDto } from "@/modules/split/service";
import { familyHasTransactions, ledgerTotals } from "@/modules/transacoes/extrato";
import { listTransactions } from "@/modules/transacoes/service";

/** GET /api/v1/home (SDD-005 §3.2). Chamado dentro de transação REPEATABLE READ (um instantâneo). */
export async function getHome(tx: Tx, ctx: RequestContext, periodKey?: string): Promise<HomeDTO> {
  const accounts = await listAccounts(tx, ctx);
  const loaded = await loadSettlement(tx, ctx, periodKey);
  const settlement = toSettlementDto(loaded, ctx);
  const { start, end } = loaded.period;
  const totals = await ledgerTotals(tx, {
    familyId: ctx.familyId,
    start,
    end,
    includeDeleted: false,
  });
  const paid = await homeRepo(tx, ctx.familyId).paidByMember(start, end);
  const members = loaded.members.map((m, i) => ({
    ref: loaded.refs.get(m.id) as NonNullable<ReturnType<typeof loaded.refs.get>>,
    id: m.id,
    ordinal: i,
    paid: paid.get(m.id) ?? 0,
  }));
  const totalPaid = members.reduce((s, m) => s + m.paid, 0);
  const shares =
    totalPaid > 0
      ? apportion(
          100,
          members.map((m) => ({ key: m.id, weight: m.paid, ordinal: m.ordinal })),
        )
      : {};
  const recent = await listTransactions(tx, ctx, {
    from: "1970-01-01",
    to: "2999-12-31",
    limit: 5,
  });
  const payables = await homePayables(tx, ctx);
  const hasTransaction = await familyHasTransactions(tx, ctx.familyId);
  const hasAccount = accounts.items.length > 0;
  return {
    period: { key: loaded.period.key, start, end },
    familyBalanceInCents: accounts.totalBalanceInCents,
    accounts: accounts.items,
    settlement: {
      period: settlement.period,
      status: settlement.status,
      suggestions: settlement.suggestions,
      rule: settlement.rule,
    },
    monthSummary: {
      incomeInCents: totals.incomeInCents,
      expenseInCents: totals.expenseInCents,
      byMember: members.map((m) => ({
        member: m.ref,
        paidInCents: m.paid,
        sharePercent: shares[m.id] ?? 0,
      })),
    },
    payables,
    recent: recent.items,
    onboarding: {
      hasAccount,
      hasOtherMember: members.length > 1,
      hasTransaction,
      showChecklist: !hasAccount && !hasTransaction,
    },
    memberCount: members.length,
  };
}
