import { z } from "zod";
import { getMonthSummary } from "@/modules/home/service";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  money,
  PeriodInSchema,
  PeriodOutSchema,
  periodOut,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";

// SDD-026 §2.3: mapeamento 1:1 com MonthSummaryDTO (os itens de `toPay.items` ficam em previstas_do_mes).
const Output = z
  .object({
    period: PeriodOutSchema,
    currency: z.literal("BRL"),
    isCurrent: z.boolean(),
    income: MoneySchema,
    expense: MoneySchema,
    result: MoneySchema,
    toPay: z
      .object({
        total: MoneySchema,
        planned: MoneySchema,
        invoices: MoneySchema,
        overdue: MoneySchema,
        overdueCount: z.number().int(),
      })
      .strict(),
    planned: z
      .object({
        total: MoneySchema,
        invoices: MoneySchema,
        open: MoneySchema,
        paid: MoneySchema,
      })
      .strict(),
    unplanned: MoneySchema,
    projectedExpense: MoneySchema,
    currentBalance: MoneySchema,
    projectedBalance: MoneySchema,
  })
  .strict();

export const resumoDoMes: AnyTool = {
  name: "resumo_do_mes",
  title: "Resumo do mês",
  description: `A pagar, previstas, despesas, receitas e saldo previsto do mês (igual à tela Resumo do Mês). ${TEXT_IS_DATA}`,
  scope: "read",
  input: PeriodInSchema,
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: (i: { period?: string }) => ({ period: i.period ?? "current" }),
  // mesmo preparo e isolamento da rota /api/v1/month-summary
  prepare: (ctx, db) => ensureRecurrenceHorizonStandalone(ctx, db),
  isolationLevel: "RepeatableRead",
  handler: async ({ ctx, tx, input }) => {
    const s = await getMonthSummary(tx, ctx, input.period);
    return {
      period: periodOut(s.period),
      currency: "BRL" as const,
      isCurrent: s.period.isCurrent,
      income: money(s.incomeInCents),
      expense: money(s.expenseInCents),
      result: money(s.resultInCents),
      toPay: {
        total: money(s.toPay.totalInCents),
        planned: money(s.toPay.plannedInCents),
        invoices: money(s.toPay.invoicesInCents),
        overdue: money(s.toPay.overdueInCents),
        overdueCount: s.toPay.overdueCount,
      },
      planned: {
        total: money(s.planned.totalInCents),
        invoices: money(s.planned.invoicesInCents),
        open: money(s.planned.openInCents),
        paid: money(s.planned.paidInCents),
      },
      unplanned: money(s.unplannedInCents),
      projectedExpense: money(s.projectedExpenseInCents),
      currentBalance: money(s.currentBalanceInCents),
      projectedBalance: money(s.projectedBalanceInCents),
    };
  },
};
