import type { AnalysisPayload } from "@/modules/analise-ia/payload";

// "O que será enviado" legível (SDD-023 §2.3): derivado do payload, sem nomes de pessoas nem do estabelecimento.
export function readableOf(payload: AnalysisPayload) {
  const labelOf = new Map(payload.categories.map((c) => [c.ref, c.label]));
  return {
    categories: payload.categories.map((c) => ({
      label: c.label,
      months: c.totals.map((t) => ({ rel: t.rel, amountInCents: t.amountInCents })),
    })),
    recurring: payload.recurring.map((r, i) => ({
      ref: r.ref,
      label: `Recorrente ${i + 1} (${labelOf.get(r.categoryRef) ?? "Outra categoria"})`,
      monthlyAvgInCents: r.monthlyAvgInCents,
      months: r.presentIn.length,
    })),
  };
}

export const sentSummary = (months: number) =>
  `totais por categoria dos últimos ${months} meses e valores recorrentes, sem nomes de pessoas nem dados de conta`;
