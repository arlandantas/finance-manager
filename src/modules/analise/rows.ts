import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { buildLedgerWhere } from "@/modules/transacoes/extrato";
import type { LedgerFilters } from "@/modules/transacoes/schemas";

export type CategoryRow = {
  categoryId: string | null;
  label: string;
  archived: boolean;
  amountInCents: number;
  count: number;
};

/** Soma/contagem por categoria do lado `f.type`, pelo MESMO predicado do Extrato (`buildLedgerWhere`). */
export async function categoryRows(tx: Tx, f: LedgerFilters): Promise<CategoryRow[]> {
  const where = buildLedgerWhere(f);
  const rows = await tx.$queryRaw<
    Array<{ id: string | null; name: string | null; archived: boolean; total: bigint; n: number }>
  >`
    SELECT t."categoryId"::text AS id, c.name AS name, (c."archivedAt" IS NOT NULL) AS archived,
           SUM(t."amountInCents")::bigint AS total, COUNT(*)::int AS n
    FROM transactions t
    LEFT JOIN categories c ON c.id = t."categoryId" AND c."familyId" = t."familyId"
    WHERE ${where} AND t."deletedAt" IS NULL AND t.kind IN ('EXPENSE', 'INCOME')
    GROUP BY t."categoryId", c.name, c."archivedAt"`;
  return rows
    .map((r) => ({
      categoryId: r.id,
      label: r.name ?? "Sem categoria",
      archived: r.archived,
      amountInCents: toCents(r.total),
      count: r.n,
    }))
    .sort((a, b) => b.amountInCents - a.amountInCents || a.label.localeCompare(b.label, "pt-BR"));
}
