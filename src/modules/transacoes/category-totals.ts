import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { periodPredicate } from "@/modules/transacoes/ledger-where";

export type CategoryExpenseRow = { categoryId: string; totalInCents: number; count: number };

/**
 * Despesas por categoria no período (SDD-026 §2.4): fonte única da Análise (SDD-023 §4.1) e do MCP.
 * Mesmo predicado de período do Extrato/Resumo: Σ categorias = `ledgerTotals.expenseInCents`.
 */
export async function expenseByCategory(
  tx: Tx,
  familyId: string,
  period: { start: string; end: string },
): Promise<CategoryExpenseRow[]> {
  const rows = await tx.$queryRaw<Array<{ id: string; total: bigint; n: number }>>`
    SELECT t."categoryId"::text AS id, SUM(t."amountInCents")::bigint AS total, COUNT(*)::int AS n
    FROM transactions t
    WHERE t."familyId" = ${familyId}::uuid AND t."deletedAt" IS NULL AND t.kind = 'EXPENSE'
      AND ${periodPredicate("t", period.start, period.end)}
    GROUP BY t."categoryId"`;
  return rows.map((r) => ({ categoryId: r.id, totalInCents: toCents(r.total), count: r.n }));
}
