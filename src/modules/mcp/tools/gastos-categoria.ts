import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/schemas";
import { listCategories } from "@/modules/categorias/service";
import { getMonthSummary } from "@/modules/home/service";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  money,
  name60,
  PeriodInSchema,
  PeriodOutSchema,
  periodOut,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";
import { expenseByCategory } from "@/modules/transacoes/category-totals";

// SDD-026 §2.4: total do mês = getMonthSummary.expenseInCents = Σ categorias (reconciliação).
const Output = z
  .object({
    period: PeriodOutSchema,
    currency: z.literal("BRL"),
    total: MoneySchema,
    categories: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          total: MoneySchema,
          count: z.number().int(),
          shareOfTotalPct: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

const Input = PeriodInSchema.extend({
  categoryId: uuidSchema.optional().describe("Filtra uma categoria (id de listar_cadastros)."),
}).strict();

export const gastosPorCategoria: AnyTool = {
  name: "gastos_por_categoria",
  title: "Gastos por categoria",
  description: `Total de despesas por categoria no mês (mesmos números do Resumo do Mês). Sem filtro, "total" é a despesa do mês; com categoryId, "total" é o da categoria e o percentual segue sendo sobre o mês. ${TEXT_IS_DATA}`,
  scope: "read",
  input: Input,
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: (i: { period?: string; categoryId?: string }) => ({
    period: i.period ?? "current",
    ...(i.categoryId ? { categoryIds: [i.categoryId] } : {}),
  }),
  prepare: (ctx, db) => ensureRecurrenceHorizonStandalone(ctx, db),
  isolationLevel: "RepeatableRead",
  handler: async ({ ctx, tx, input }) => {
    const summary = await getMonthSummary(tx, ctx, input.period);
    const cats = (await listCategories(tx, ctx, undefined, true)).items;
    const names = new Map(cats.map((c) => [c.id, c.name] as const));
    if (input.categoryId && !names.has(input.categoryId)) {
      throw notFound("Categoria não encontrada");
    }
    const spent = await expenseByCategory(tx, ctx.familyId, summary.period);
    const pct = (inCents: number) =>
      summary.expenseInCents > 0 ? Math.round((inCents * 1000) / summary.expenseInCents) / 10 : 0;
    const rows = spent
      .filter((r) => !input.categoryId || r.categoryId === input.categoryId)
      .map((r) => ({
        id: r.categoryId,
        name: name60(names.get(r.categoryId) ?? "Categoria"),
        totalInCents: r.totalInCents,
        count: r.count,
      }));
    // filtrada e sem gasto no mês: item com total zero
    if (input.categoryId && rows.length === 0) {
      rows.push({
        id: input.categoryId,
        name: name60(names.get(input.categoryId) as string),
        totalInCents: 0,
        count: 0,
      });
    }
    rows.sort((a, b) => b.totalInCents - a.totalInCents || a.name.localeCompare(b.name, "pt-BR"));
    return {
      period: periodOut(summary.period),
      currency: "BRL" as const,
      total: money(
        input.categoryId ? rows.reduce((s, r) => s + r.totalInCents, 0) : summary.expenseInCents,
      ),
      categories: rows.map((r) => ({
        id: r.id,
        name: r.name,
        total: money(r.totalInCents),
        count: r.count,
        shareOfTotalPct: pct(r.totalInCents),
      })),
    };
  },
};
