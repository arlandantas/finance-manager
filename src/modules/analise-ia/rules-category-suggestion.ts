// SDD-023 §4.6: regra LOCAL de sugestão de categoria (US-072), sem LLM. PURA.
// Por descrição normalizada com ≥ 3 despesas ativas na janela: a categoria majoritária M com ≥ 70% dos
// lançamentos; cada lançamento em categoria ≠ M (e M elegível) vira sugestão `from → M`, salvo recusa.

export const MIN_COUNT = 3;
export const MIN_SHARE_PERCENT = 70;
export const MAX_SUGGESTIONS = 20;

export type SuggestionRow = {
  id: string;
  version: number;
  description: string;
  descriptionKey: string; // já normalizada (não vazia)
  occurredOn: string;
  amountInCents: number;
  categoryId: string;
};

export type Suggestion = {
  row: SuggestionRow;
  toCategoryId: string;
  countInTarget: number;
  total: number;
};

export const dismissKey = (descriptionKey: string, toCategoryId: string) =>
  `${descriptionKey}|${toCategoryId}`;

export function computeSuggestions(
  rows: SuggestionRow[],
  o: {
    eligibleCategoryIds: Set<string>; // categorias ativas de despesa
    dismissed: Set<string>; // `dismissKey`
    limit?: number;
  },
): Suggestion[] {
  const groups = new Map<string, SuggestionRow[]>();
  for (const r of rows) {
    const g = groups.get(r.descriptionKey);
    if (g) g.push(r);
    else groups.set(r.descriptionKey, [r]);
  }
  const out: Suggestion[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_COUNT) continue;
    const counts = new Map<string, number>();
    for (const r of group) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const [cat, n] of counts) {
      if (!best || n > best[1] || (n === best[1] && cat < best[0])) best = [cat, n];
    }
    if (!best) continue;
    const [target, n] = best;
    if (n * 100 < group.length * MIN_SHARE_PERCENT) continue;
    if (!o.eligibleCategoryIds.has(target)) continue;
    if (o.dismissed.has(dismissKey(key, target))) continue;
    for (const r of group) {
      if (r.categoryId !== target) {
        out.push({ row: r, toCategoryId: target, countInTarget: n, total: group.length });
      }
    }
  }
  return out
    .sort((a, b) =>
      a.row.occurredOn < b.row.occurredOn
        ? 1
        : a.row.occurredOn > b.row.occurredOn
          ? -1
          : a.row.id < b.row.id
            ? 1
            : -1,
    )
    .slice(0, o.limit ?? MAX_SUGGESTIONS);
}
