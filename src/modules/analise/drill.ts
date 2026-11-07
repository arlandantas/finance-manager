import type { AnalysisQuery } from "@/modules/analise/schemas";

/**
 * Link de drill-down ao Extrato (US-048): mesmo período, filtros e tipo da análise. Puro.
 * A linha vira o filtro da própria dimensão (`categoryId`, `payerIds`, `sourceIds`, `tagIds` ou
 * `untagged`) no lugar do filtro plural equivalente; os demais seguem como parâmetros repetidos.
 */
export function buildDrillUrl(
  q: AnalysisQuery,
  periodKey: string,
  row: {
    categoryId?: string | null;
    payerId?: string | null;
    sourceId?: string | null;
    tagId?: string | null;
    untagged?: boolean;
  },
): string {
  const p = new URLSearchParams();
  if (q.from && q.to) {
    p.set("from", q.from);
    p.set("to", q.to);
  } else {
    p.set("period", periodKey);
  }
  p.set("type", q.type);
  if (row.categoryId) p.set("categoryId", row.categoryId);
  else for (const id of q.categoryIds ?? []) p.append("categoryIds", id);
  for (const id of row.payerId ? [row.payerId] : (q.payerIds ?? [])) p.append("payerIds", id);
  for (const id of row.sourceId ? [row.sourceId] : (q.sourceIds ?? [])) p.append("sourceIds", id);
  for (const id of row.tagId ? [row.tagId] : (q.tagIds ?? [])) p.append("tagIds", id);
  if (row.untagged || q.untagged) p.set("untagged", "true");
  return `/extrato?${p.toString()}`;
}
