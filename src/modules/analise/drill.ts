import type { AnalysisQuery } from "@/modules/analise/schemas";

/**
 * Link de drill-down ao Extrato (US-048): mesmo período, filtros e tipo da análise. Puro.
 * A linha de categoria vira `categoryId`; os demais filtros seguem como parâmetros repetidos.
 */
export function buildDrillUrl(
  q: AnalysisQuery,
  periodKey: string,
  row: { categoryId?: string | null },
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
  for (const id of q.payerIds ?? []) p.append("payerIds", id);
  for (const id of q.sourceIds ?? []) p.append("sourceIds", id);
  for (const id of q.tagIds ?? []) p.append("tagIds", id);
  if (q.untagged) p.set("untagged", "true");
  return `/extrato?${p.toString()}`;
}
