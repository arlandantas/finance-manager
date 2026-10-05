import { apportion } from "@/lib/apportion";
import type { DateISO } from "@/lib/dates";
import type { Period } from "@/lib/period";
import type { RuleInput } from "@/modules/split/rules";
import {
  computeSettlement,
  type ExpenseInput,
  type MemberInput,
  type SettledInput,
} from "@/modules/split/settlement";

/** Prévia da regra (US-031, SDD-011 §2/§4.6): pura, não grava nada. */
export type RulePreviewDTO = {
  effectiveFrom: string;
  currentShares: Array<{ memberId: string; bps: number }>;
  nextShares: Array<{ memberId: string; bps: number }>;
  period: { key: string };
  currentToSettleInCents: number;
  nextToSettleInCents: number;
  impactInCents: number; // Σ|Δ saldo| ÷ 2
  affectedExpensesCount: number;
};

export type PreviewCandidate = {
  kind: "EQUAL" | "PROPORTIONAL";
  shares: Array<{ memberId: string; bps: number }>;
};

export function computeRulePreview(i: {
  period: Period;
  members: MemberInput[];
  expenses: ExpenseInput[];
  rules: RuleInput[];
  settlements: SettledInput[];
  candidate: PreviewCandidate;
  effectiveFrom: DateISO;
  nowIso: string;
  currentShares: Array<{ memberId: string; bps: number }>;
  nextShares: Array<{ memberId: string; bps: number }>;
}): RulePreviewDTO {
  const base = {
    period: i.period,
    members: i.members,
    expenses: i.expenses,
    settlements: i.settlements,
  };
  const a = computeSettlement({ ...base, rules: i.rules });
  const candidate: RuleInput = {
    id: "preview-candidate",
    kind: i.candidate.kind,
    effectiveFrom: i.effectiveFrom,
    createdAt: i.nowIso,
    shares: i.candidate.kind === "PROPORTIONAL" ? i.candidate.shares : [],
  };
  const b = computeSettlement({ ...base, rules: [...i.rules, candidate] });
  const balanceOf = (r: typeof a, id: string) =>
    r.members.find((m) => m.memberId === id)?.balanceInCents ?? 0;
  const delta = i.members.reduce(
    (s, m) => s + Math.abs(balanceOf(b, m.id) - balanceOf(a, m.id)),
    0,
  );
  const toSettle = (r: typeof a) => r.suggestions.reduce((s, x) => s + x.amountInCents, 0);
  return {
    effectiveFrom: i.effectiveFrom,
    currentShares: i.currentShares,
    nextShares: i.nextShares,
    period: { key: i.period.key },
    currentToSettleInCents: toSettle(a),
    nextToSettleInCents: toSettle(b),
    impactInCents: delta / 2,
    affectedExpensesCount: i.expenses.filter((e) => e.occurredOn >= i.effectiveFrom).length,
  };
}

/** Percentual inteiro proporcional às rendas (ex.: 650000 e 480000 => 58% / 42%). A renda nunca sai do navegador. */
export function suggestBpsFromIncomes(
  i: Array<{ memberId: string; ordinal: number; incomeInCents: number }>,
): Array<{ memberId: string; bps: number }> {
  const out = apportion(
    100,
    i.map((m) => ({ key: m.memberId, weight: m.incomeInCents, ordinal: m.ordinal })),
  );
  return i.map((m) => ({ memberId: m.memberId, bps: (out[m.memberId] as number) * 100 }));
}
