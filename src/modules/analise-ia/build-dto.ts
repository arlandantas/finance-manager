import type {
  AnalysisClassDTO,
  AnalysisPayloadDTO,
  MemberRefDTO,
  PeriodDTO,
  SpendingAnalysisDTO,
} from "@/modules/analise-ia/dto";
import { ANALYSIS_DISCLAIMER } from "@/modules/analise-ia/labels";
import type { AnalysisResult } from "@/modules/analise-ia/output";
import { type RefMap, recurringDismissKey } from "@/modules/analise-ia/payload";

// SDD-023 §4.5: montagem do resultado. PURA. Todo valor exibido vem do PAYLOAD gravado (instantâneo do
// que foi analisado e enviado); a IA só contribui com classe e texto. Nenhum campo numérico vem da IA.

/** Chave de descarte (US-071) de um item evitável. */
export function dismissalKeyOf(i: {
  kind: "RECURRING" | "CATEGORY";
  categoryId: string;
  descriptionKey: string | null;
  recurringExpenseId: string | null;
}): string {
  return i.kind === "RECURRING" ? recurringDismissKey(i) : `CATEGORY|${i.categoryId}|`;
}

const CLASS_ORDER: AnalysisClassDTO[] = ["ESSENTIAL", "IMPORTANT", "SUPERFLUOUS", "UNCLASSIFIED"];

export type AnalysisRow = {
  id: string;
  period: PeriodDTO;
  createdAt: Date;
  model: string;
  payload: AnalysisPayloadDTO;
  result: AnalysisResult;
  refMap: RefMap;
};

export function toAnalysisDTO(
  row: AnalysisRow,
  o: {
    requestedBy: MemberRefDTO;
    categoryNames: Map<string, string>; // nome ATUAL por id
    dismissedKeys: Set<string>;
  },
): SpendingAnalysisDTO {
  const { payload, result, refMap } = row;
  const amountAt = (ref: string, rel: number): number | null =>
    payload.categories.find((c) => c.ref === ref)?.totals.find((t) => t.rel === rel)
      ?.amountInCents ?? null;
  const hasPrev = payload.months.some((m) => m.rel === -1);

  const groups = CLASS_ORDER.map((cls) => ({
    class: cls,
    categories: result.categories
      .filter((c) => c.class === cls)
      .map((c) => {
        const categoryId = refMap.categories[c.ref] as string;
        const cur = amountAt(c.ref, 0) ?? 0;
        const prev = hasPrev ? amountAt(c.ref, -1) : null;
        return {
          categoryId,
          label:
            o.categoryNames.get(categoryId) ??
            payload.categories.find((x) => x.ref === c.ref)?.label ??
            "Categoria",
          amountInCents: cur,
          prevAmountInCents: prev,
          deltaPermille: prev && prev > 0 ? Math.round(((cur - prev) * 1000) / prev) : null,
          reason: c.reason,
          reasonFromAi: c.reasonFromAi,
        };
      })
      .sort((a, b) => b.amountInCents - a.amountInCents),
  })).filter((g) => g.categories.length > 0);

  const avoidable: SpendingAnalysisDTO["avoidable"] = [];
  for (const a of result.avoidable) {
    const rec = refMap.recurring[a.ref];
    const periodKey = row.period.key;
    if (rec) {
      const p = payload.recurring.find((r) => r.ref === a.ref);
      if (!p) continue;
      if (
        o.dismissedKeys.has(
          dismissalKeyOf({
            kind: "RECURRING",
            categoryId: rec.categoryId,
            descriptionKey: rec.descriptionKey,
            recurringExpenseId: rec.recurringExpenseId,
          }),
        )
      ) {
        continue;
      }
      const drill = new URLSearchParams({ period: periodKey, categoryId: rec.categoryId });
      if (rec.displayName.length >= 2 && rec.displayName.length <= 50)
        drill.set("q", rec.displayName);
      avoidable.push({
        key: a.ref,
        kind: "RECURRING",
        displayName: rec.displayName,
        categoryId: rec.categoryId,
        monthlyInCents: p.monthlyAvgInCents,
        annualInCents: p.monthlyAvgInCents * 12,
        reason: a.reason,
        reasonFromAi: a.reasonFromAi,
        drillUrl: `/extrato?${drill.toString()}`,
      });
      continue;
    }
    const categoryId = refMap.categories[a.ref];
    const cat = payload.categories.find((c) => c.ref === a.ref);
    if (!categoryId || !cat) continue;
    if (
      o.dismissedKeys.has(
        dismissalKeyOf({
          kind: "CATEGORY",
          categoryId,
          descriptionKey: null,
          recurringExpenseId: null,
        }),
      )
    ) {
      continue;
    }
    const active = cat.totals.filter((t) => t.amountInCents > 0);
    const monthly = active.length
      ? Math.floor(
          (active.reduce((s, t) => s + t.amountInCents, 0) * 2 + active.length) /
            (2 * active.length),
        )
      : 0;
    avoidable.push({
      key: a.ref,
      kind: "CATEGORY",
      displayName: o.categoryNames.get(categoryId) ?? cat.label,
      categoryId,
      monthlyInCents: monthly,
      annualInCents: monthly * 12,
      reason: a.reason,
      reasonFromAi: a.reasonFromAi,
      drillUrl: `/extrato?${new URLSearchParams({ period: row.period.key, categoryId }).toString()}`,
    });
  }
  avoidable.sort((a, b) => b.monthlyInCents - a.monthlyInCents);

  return {
    id: row.id,
    period: row.period,
    createdAt: row.createdAt.toISOString(),
    requestedBy: o.requestedBy,
    summary: result.summary,
    summaryFromAi: result.summaryFromAi,
    aiGenerated: true,
    model: row.model,
    groups,
    avoidable,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}
