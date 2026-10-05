import { apportion } from "@/lib/apportion";
import { addDays, type DateISO } from "@/lib/dates";
import type { Period } from "@/lib/period";
import {
  equalShares,
  formatBps,
  formatBpsList,
  type RuleInput,
  ruleAt,
} from "@/modules/split/rules";
import type { ExpenseInput, MemberInput, SettlementResult } from "@/modules/split/settlement";

/** Explicação da divisão aplicada no mês (US-022, SDD-011 §4.1): pura, mesma fonte das cotas. */
export type SplitSegmentDTO = {
  ruleVersionId: string;
  kind: "EQUAL" | "PROPORTIONAL";
  isDefault: boolean; // versão inicial (effectiveFrom 1970-01-01) => "(padrão)"
  from: string | null; // 1º dia do trecho dentro do período; null = desde o início do período
  to: string | null; // último dia do trecho dentro do período; null = até o fim do período
  shares: Array<{ memberId: string; bps: number }>;
  expensesCount: number;
  totalInCents: number;
};
export type SplitExplanationDTO = {
  segments: SplitSegmentDTO[];
  weighted: null | { shares: Array<{ memberId: string; permille: number }> };
  showWeighted: boolean;
};

const DEFAULT_EFFECTIVE_FROM = "1970-01-01";

/** Interface única (ADR-016 §6): na R2.1 por vigência; na R3, por rateio gravado. */
export function explainByRules(i: {
  period: Period;
  today: DateISO;
  rules: RuleInput[];
  members: MemberInput[];
  expenses: ExpenseInput[];
  result: SettlementResult;
}): SplitExplanationDTO | null {
  if (i.result.totalSharedInCents === 0) return null;
  const limit = i.period.end < i.today ? i.period.end : i.today;
  const members = [...i.members].sort(
    (a, b) => a.ordinal - b.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  // Datas de início de trecho: início do período + vigências dentro de (início, limite].
  const starts = [
    ...new Set(i.rules.map((r) => r.effectiveFrom).filter((d) => d > i.period.start && d <= limit)),
  ].sort();
  const dates: DateISO[] = [i.period.start, ...starts];

  const segments: SplitSegmentDTO[] = dates.map((date, idx) => {
    const rule = ruleAt(i.rules, date);
    const next = dates[idx + 1];
    let shares: Array<{ memberId: string; bps: number }>;
    if (rule.kind === "EQUAL") {
      const joined = members.filter((m) => m.joinedOn <= i.period.end);
      shares = equalShares(joined.length > 0 ? joined : members);
    } else {
      const bps = new Map(rule.shares.map((s) => [s.memberId, s.bps]));
      shares = members.map((m) => ({ memberId: m.id, bps: bps.get(m.id) ?? 0 }));
    }
    const mine = i.expenses.filter((e) => ruleAt(i.rules, e.occurredOn).id === rule.id);
    return {
      ruleVersionId: rule.id,
      kind: rule.kind,
      isDefault: rule.effectiveFrom === DEFAULT_EFFECTIVE_FROM && i.rules.length === 1,
      from: idx === 0 ? null : date,
      to: next ? addDays(next, -1) : null,
      shares,
      expensesCount: mine.length,
      totalInCents: mine.reduce((s, e) => s + e.amountInCents, 0),
    };
  });

  const weights = i.result.members.map((m, idx) => ({
    key: m.memberId,
    weight: m.quotaInCents,
    ordinal: idx,
  }));
  const split = apportion(1000, weights);
  const weighted = {
    shares: i.result.members.map((m) => ({
      memberId: m.memberId,
      permille: split[m.memberId] ?? 0,
    })),
  };
  const vectors = new Set(
    segments.map((s) => s.shares.map((x) => `${x.memberId}:${x.bps}`).join("|")),
  );
  return { segments, weighted, showWeighted: vectors.size >= 2 };
}

/** 557 -> "55,7" ; 1000 -> "100,0" (uma casa decimal; sem float). */
export function formatPermille(permille: number): string {
  return `${Math.floor(permille / 10)},${permille % 10}`;
}

const dayMonth = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Texto do rótulo (e da linha ponderada) a partir da explicação; `order` = ids na ordem canônica. */
export function formatSplitLabel(
  e: SplitExplanationDTO,
  order: string[],
): { label: string; weightedLine: string | null } {
  const list = (s: SplitSegmentDTO) =>
    formatBpsList(order.map((id) => ({ bps: s.shares.find((x) => x.memberId === id)?.bps ?? 0 })));
  const only = e.segments[0];
  let label: string;
  if (e.segments.length === 1 && only) {
    if (only.isDefault) label = "Divisão igual (padrão)";
    else if (only.kind === "EQUAL") label = `Divisão igual (${list(only)})`;
    else label = `Divisão proporcional (${list(only)})`;
  } else {
    const last = e.segments.length - 1;
    label = e.segments
      .map((s, idx) => {
        if (idx === 0 && s.to) return `${list(s)} até ${dayMonth(s.to)}`;
        if (idx === last && s.from) return `${list(s)} a partir de ${dayMonth(s.from)}`;
        return `${list(s)} de ${dayMonth(s.from ?? "")} a ${dayMonth(s.to ?? "")}`;
      })
      .join(" · ");
  }
  const weightedLine =
    e.showWeighted && e.weighted
      ? `Na prática neste mês: ${order
          .map(
            (id) =>
              `${formatPermille(e.weighted?.shares.find((x) => x.memberId === id)?.permille ?? 0)}%`,
          )
          .join(" / ")}`
      : null;
  return { label, weightedLine };
}

export { formatBps };
