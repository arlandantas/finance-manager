import { apportion } from "@/lib/apportion";
import type { DateISO } from "@/lib/dates";
import type { Period } from "@/lib/period";
import { isRuleStale, type RuleInput, ruleAt } from "@/modules/split/rules";

/** Motor do acerto de contas (SDD-002 §4): puro, centavos inteiros, sem I/O nem relógio. */
export type MemberInput = {
  id: string;
  ordinal: number;
  joinedOn: DateISO;
  removedOn?: DateISO | null;
};

/** Não saiu antes do início do período (ADR-019 §6; `removedOn >= início`). A entrada tardia é tratada pelo motor. */
export function isPresent(m: MemberInput, period: { start: DateISO; end: DateISO }): boolean {
  void period.end;
  return m.removedOn == null || m.removedOn >= period.start;
}
/** Somente despesas comuns ativas (kind EXPENSE, isSharedExpense, sem exclusão). */
export type ExpenseInput = {
  id: string;
  amountInCents: number;
  payerMemberId: string;
  occurredOn: DateISO;
};
/** Acertos ativos do período. */
export type SettledInput = { fromMemberId: string; toMemberId: string; amountInCents: number };

export type SettlementStatus = "NEEDS_MORE_MEMBERS" | "EMPTY" | "BALANCED" | "PENDING" | "SETTLED";

export type MemberBalance = {
  memberId: string;
  paidInCents: number;
  quotaInCents: number;
  differenceInCents: number; // paid - quota (sem acertos)
  settledAdjustmentInCents: number; // + quem pagou acertos; - quem recebeu
  balanceInCents: number; // difference + adjustment
};
export type Suggestion = { fromMemberId: string; toMemberId: string; amountInCents: number };
export type SettlementResult = {
  status: SettlementStatus;
  totalSharedInCents: number;
  members: MemberBalance[]; // ordem canônica (ordinal, id)
  suggestions: Suggestion[];
};

export type SettlementInput = {
  period: Period;
  members: MemberInput[];
  expenses: ExpenseInput[];
  rules: RuleInput[];
  settlements: SettledInput[];
};

const byOrdinal = <T extends { ordinal: number; id: string }>(a: T, b: T) =>
  a.ordinal - b.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** SDD-002 §4.4: guloso determinístico, no máximo N-1 sugestões. */
export function suggestSettlements(
  balances: Array<{ memberId: string; ordinal: number; balanceInCents: number }>,
): Suggestion[] {
  const debtors = balances
    .filter((b) => b.balanceInCents < 0)
    .map((b) => ({ id: b.memberId, ordinal: b.ordinal, value: -b.balanceInCents }));
  const creditors = balances
    .filter((b) => b.balanceInCents > 0)
    .map((b) => ({ id: b.memberId, ordinal: b.ordinal, value: b.balanceInCents }));
  const pickMax = (list: typeof debtors) =>
    list.reduce((best, cur) =>
      cur.value > best.value || (cur.value === best.value && cur.ordinal < best.ordinal)
        ? cur
        : best,
    );
  const out: Suggestion[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    const d = pickMax(debtors);
    const c = pickMax(creditors);
    const x = Math.min(d.value, c.value);
    out.push({ fromMemberId: d.id, toMemberId: c.id, amountInCents: x });
    d.value -= x;
    c.value -= x;
    if (d.value === 0) debtors.splice(debtors.indexOf(d), 1);
    if (c.value === 0) creditors.splice(creditors.indexOf(c), 1);
  }
  return out;
}

export function computeSettlement(i: SettlementInput): SettlementResult {
  const everyone = [...i.members].sort(byOrdinal);
  // quem já saiu antes do período não participa; quem pagou despesa do período sempre entra (crédito preservado)
  const payers = new Set(i.expenses.map((e) => e.payerMemberId));
  const members = everyone.filter((m) => isPresent(m, i.period) || payers.has(m.id));
  const expenses = [...i.expenses].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const paid = new Map(members.map((m) => [m.id, 0]));
  const quota = new Map(members.map((m) => [m.id, 0]));
  const adjustment = new Map(members.map((m) => [m.id, 0]));
  let totalShared = 0;

  // 1) agrupar por regra vigente na data da despesa
  const groups = new Map<string, { rule: RuleInput; total: number }>();
  for (const e of expenses) {
    totalShared += e.amountInCents;
    paid.set(e.payerMemberId, (paid.get(e.payerMemberId) ?? 0) + e.amountInCents);
    const rule = ruleAt(i.rules, e.occurredOn);
    const g = groups.get(rule.id) ?? { rule, total: 0 };
    g.total += e.amountInCents;
    groups.set(rule.id, g);
  }

  // 2) cota por grupo de regra (maior resto sobre o total do grupo)
  for (const { rule, total } of groups.values()) {
    if (total === 0) continue;
    let parts: Array<{ key: string; weight: number; ordinal: number }>;
    if (rule.kind === "EQUAL") {
      const joined = members.filter((m) => m.joinedOn <= i.period.end);
      const participants = joined.length > 0 ? joined : members;
      parts = participants.map((m) => ({ key: m.id, weight: 1, ordinal: m.ordinal }));
    } else {
      const bps = new Map(rule.shares.map((s) => [s.memberId, s.bps]));
      parts = members.map((m) => ({ key: m.id, weight: bps.get(m.id) ?? 0, ordinal: m.ordinal }));
      if (parts.every((p) => p.weight === 0)) {
        // regra totalmente desatualizada: cai para partes iguais (conservador)
        parts = members.map((m) => ({ key: m.id, weight: 1, ordinal: m.ordinal }));
      }
    }
    const split = apportion(total, parts);
    for (const [memberId, v] of Object.entries(split)) {
      quota.set(memberId, (quota.get(memberId) ?? 0) + v);
    }
  }

  // 3) acertos ajustam o saldo líquido, nunca entram como despesa
  for (const s of i.settlements) {
    adjustment.set(s.fromMemberId, (adjustment.get(s.fromMemberId) ?? 0) + s.amountInCents);
    adjustment.set(s.toMemberId, (adjustment.get(s.toMemberId) ?? 0) - s.amountInCents);
  }

  const rows: MemberBalance[] = members.map((m) => {
    const p = paid.get(m.id) ?? 0;
    const q = quota.get(m.id) ?? 0;
    const adj = adjustment.get(m.id) ?? 0;
    return {
      memberId: m.id,
      paidInCents: p,
      quotaInCents: q,
      differenceInCents: p - q,
      settledAdjustmentInCents: adj,
      balanceInCents: p - q + adj,
    };
  });

  const suggestions = suggestSettlements(
    rows.map((r, idx) => ({
      memberId: r.memberId,
      ordinal: members[idx]?.ordinal ?? idx,
      balanceInCents: r.balanceInCents,
    })),
  );

  let status: SettlementStatus;
  if (members.length < 2) status = "NEEDS_MORE_MEMBERS";
  else if (expenses.length === 0 && i.settlements.length === 0) status = "EMPTY";
  else if (suggestions.length > 0) status = "PENDING";
  else if (i.settlements.length > 0) status = "SETTLED";
  else status = "BALANCED";

  return { status, totalSharedInCents: totalShared, members: rows, suggestions };
}

export { isRuleStale };
