import type { AnalysisGroupBy } from "@/modules/analise/schemas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GROUPS: readonly AnalysisGroupBy[] = ["category", "member", "account", "tag"];

export type AnaliseFilters = {
  categoryIds?: string[];
  payerIds?: string[];
  sourceIds?: string[];
  tagIds?: string[];
  untagged?: boolean;
};
export type AnaliseUrl = AnaliseFilters & {
  period?: string;
  from?: string;
  to?: string;
  type: "EXPENSE" | "INCOME";
  groupBy: AnalysisGroupBy;
};

export const FILTER_KEYS = ["categoryIds", "payerIds", "sourceIds", "tagIds"] as const;

/** US-049: estado da Análise lido da URL (compartilhável). Valores inválidos são ignorados. */
export function parseAnaliseUrl(sp: {
  get(n: string): string | null;
  getAll(n: string): string[];
}): AnaliseUrl {
  const from = sp.get("from");
  const to = sp.get("to");
  const period = sp.get("period");
  const out: AnaliseUrl = {
    type: sp.get("type") === "INCOME" ? "INCOME" : "EXPENSE",
    groupBy: GROUPS.find((g) => g === sp.get("groupBy")) ?? "category",
  };
  if (from && to && ISO.test(from) && ISO.test(to)) {
    out.from = from;
    out.to = to;
  } else if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) out.period = period;
  for (const k of FILTER_KEYS) {
    const ids = [...new Set(sp.getAll(k).filter((v) => UUID.test(v)))].slice(0, 20);
    if (ids.length > 0) out[k] = ids;
  }
  if (sp.get("untagged") === "true" && !out.tagIds) out.untagged = true;
  return out;
}

/** Inverso: só o que difere do padrão entra (categoria e despesa são o padrão, mas ficam explícitos no `type`). */
export function toAnaliseSearch(u: Partial<AnaliseUrl>): string {
  const p = new URLSearchParams();
  for (const k of ["period", "from", "to", "type"] as const) if (u[k]) p.set(k, u[k]);
  if (u.groupBy && u.groupBy !== "category") p.set("groupBy", u.groupBy);
  for (const k of FILTER_KEYS) for (const id of u[k] ?? []) p.append(k, id);
  if (u.untagged) p.set("untagged", "true");
  return p.toString();
}

export const hasFilters = (u: AnaliseFilters) =>
  FILTER_KEYS.some((k) => (u[k]?.length ?? 0) > 0) || u.untagged === true;
