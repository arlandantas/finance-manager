import { z } from "zod";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  memberName,
  money,
  name60,
  PeriodInSchema,
  PeriodOutSchema,
  periodOut,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { listPayables } from "@/modules/previstas/payables";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";

// SDD-026 §2.7: contas a pagar e faturas do mês (mesmo serviço da tela A pagar).
const Output = z
  .object({
    period: PeriodOutSchema,
    currency: z.literal("BRL"),
    totals: z
      .object({ due: MoneySchema, overdue: MoneySchema, overdueCount: z.number().int() })
      .strict(),
    items: z
      .array(
        z
          .object({
            kind: z.enum(["PLANNED", "INVOICE"]),
            title: z.string(),
            dueOn: z.string(),
            amount: MoneySchema,
            isOverdue: z.boolean(),
            responsible: z.string().nullable(),
            isRecurring: z.boolean(),
            payWith: z.string().nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const previstasDoMes: AnyTool = {
  name: "previstas_do_mes",
  title: "Contas a pagar do mês",
  description: `Contas a pagar e faturas do mês, atrasadas primeiro (igual à tela A pagar). ${TEXT_IS_DATA}`,
  scope: "read",
  input: PeriodInSchema,
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: (i: { period?: string }) => ({ period: i.period ?? "current" }),
  prepare: (ctx, db) => ensureRecurrenceHorizonStandalone(ctx, db),
  handler: async ({ ctx, tx, input }) => {
    const r = await listPayables(tx, ctx, { period: input.period });
    return {
      period: periodOut(r.period),
      currency: "BRL" as const,
      totals: {
        due: money(r.totals.dueInCents),
        overdue: money(r.totals.overdueInCents),
        overdueCount: r.totals.overdueCount,
      },
      items: r.items.slice(0, 100).map((i) => ({
        kind: i.type,
        title: name60(i.title),
        dueOn: i.dueOn,
        amount: money(i.amountInCents),
        isOverdue: i.isOverdue,
        responsible: i.responsible ? memberName(i.responsible) : null,
        isRecurring: i.isRecurring,
        payWith: i.paymentAccountName ? name60(i.paymentAccountName) : null,
      })),
    };
  },
};
