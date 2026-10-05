import { apportion } from "@/lib/apportion";
import type { Period } from "@/lib/period";
import { type RuleInput, ruleAt } from "@/modules/split/rules";
import {
  byOrdinal,
  type ExpenseInput,
  isPresent,
  type MemberBalance,
  type MemberInput,
  type SettledInput,
  type SettlementResult,
  type SettlementStatus,
  suggestSettlements,
} from "@/modules/split/settlement-common";

/**
 * Motor LEGACY do acerto (SDD-002 §4; EN-002a, SDD-015 §2, ADR-016 §4): CONGELADO. O corpo é o de
 * `computeSettlement` da R1..R2.1 sem mudança de lógica; a única extração é `legacyGroupWeights` (os
 * pesos do passo 2), que a alocação do backfill e "Pela regra" reutilizam como oráculo.
 */
export type SettlementInput = {
  period: Period;
  members: MemberInput[];
  expenses: ExpenseInput[];
  rules: RuleInput[];
  settlements: SettledInput[];
};

/**
 * Pesos do grupo de uma regra (passo 2 do motor): EQUAL => participantes (joinedOn <= fim do período;
 * vazio => todos) com peso 1; PROPORTIONAL => bps da regra por membro (ausente = 0); todos 0 => partes iguais.
 * `members` já é a lista filtrada pelo motor (presentes ou pagadores).
 */
export function legacyGroupWeights(i: {
  rule: RuleInput;
  members: MemberInput[];
  period: Pick<Period, "end">;
}): Array<{ key: string; weight: number; ordinal: number }> {
  const { rule, members } = i;
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
  return parts;
}

export function computeSettlementLegacy(i: SettlementInput): SettlementResult {
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
    const parts = legacyGroupWeights({ rule, members, period: i.period });
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
