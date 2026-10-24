import { type RecurringCandidate, recurringDismissKey } from "@/modules/analise-ia/payload";

// SDD-023 §4.2: detecção de recorrentes SEM LLM. PURO: opera sobre linhas já carregadas da janela.
// O nome (`displayName`) só existe localmente; nunca entra no payload (D-GES-29).

/** NFD sem acentos, minúsculas, sem dígitos nem pontuação, espaços colapsados, até 40; vazio ⇒ "". */
export function normalizeDescription(d: string): string {
  return d
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{N}]/gu, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}

/** Arredonda meio para cima (inteiros positivos). */
export function roundHalfUp(sum: number, n: number): number {
  return Math.floor((sum * 2 + n) / (2 * n));
}

export type ExpenseRow = {
  rel: number; // 0 = período analisado, -1 = anterior...
  categoryId: string;
  description: string;
  amountInCents: number;
};

export type ScheduledSeries = {
  recurringExpenseId: string;
  displayName: string;
  categoryId: string;
  byRel: Record<number, number>; // soma paga por período (rel)
};

export const MAX_RECURRING = 15;
export const MAX_SPREAD = 1.5;

/** Quantos períodos distintos uma descrição precisa aparecer: 3 (ou 2 se a janela tem ≤ 3 meses). */
export const minPeriodsFor = (windowSize: number): number => (windowSize <= 3 ? 2 : 3);

export function detectRecurring(i: {
  rows: ExpenseRow[]; // despesas SEM parcela (installmentPlanId nulo)
  scheduled: ScheduledSeries[];
  windowSize: number;
  dismissedKeys?: Set<string>;
}): RecurringCandidate[] {
  const min = minPeriodsFor(i.windowSize);
  const out: RecurringCandidate[] = [];

  // SCHEDULED: séries ativas com ≥ 2 baixas na janela
  const absorbed = new Set<string>();
  for (const s of i.scheduled) {
    const rels = Object.keys(s.byRel)
      .map(Number)
      .filter((r) => (s.byRel[r] ?? 0) > 0);
    if (rels.length < 2) continue;
    const sum = rels.reduce((a, r) => a + (s.byRel[r] as number), 0);
    out.push({
      descriptionKey: null,
      displayName: s.displayName,
      categoryId: s.categoryId,
      source: "SCHEDULED",
      recurringExpenseId: s.recurringExpenseId,
      monthlyAvgInCents: roundHalfUp(sum, rels.length),
      presentIn: rels.sort((a, b) => a - b),
    });
    const key = normalizeDescription(s.displayName);
    if (key) absorbed.add(key);
  }

  // DETECTED: mesma descrição normalizada em ≥ min períodos, com max/min ≤ 1,5
  type Group = {
    key: string;
    categoryId: string;
    byRel: Map<number, number>;
    latest: { rel: number; description: string };
  };
  const groups = new Map<string, Group>();
  for (const r of i.rows) {
    const key = normalizeDescription(r.description);
    if (!key) continue;
    const gk = `${key}|${r.categoryId}`;
    let g = groups.get(gk);
    if (!g) {
      g = {
        key,
        categoryId: r.categoryId,
        byRel: new Map(),
        latest: { rel: r.rel, description: r.description },
      };
      groups.set(gk, g);
    }
    g.byRel.set(r.rel, (g.byRel.get(r.rel) ?? 0) + r.amountInCents);
    if (r.rel >= g.latest.rel) g.latest = { rel: r.rel, description: r.description };
  }
  for (const g of groups.values()) {
    if (absorbed.has(g.key)) continue;
    if (g.byRel.size < min) continue;
    const values = [...g.byRel.values()];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (lo <= 0 || hi / lo > MAX_SPREAD) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    out.push({
      descriptionKey: g.key,
      displayName: g.latest.description.trim(),
      categoryId: g.categoryId,
      source: "DETECTED",
      recurringExpenseId: null,
      monthlyAvgInCents: roundHalfUp(sum, values.length),
      presentIn: [...g.byRel.keys()].sort((a, b) => a - b),
    });
  }
  return out
    .filter((c) => !i.dismissedKeys?.has(recurringDismissKey(c)))
    .sort(
      (a, b) =>
        b.monthlyAvgInCents - a.monthlyAvgInCents || a.displayName.localeCompare(b.displayName),
    )
    .slice(0, MAX_RECURRING);
}
