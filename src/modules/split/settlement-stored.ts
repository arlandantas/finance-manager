import type { Period } from "@/lib/period";
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
 * Motor STORED do acerto (EN-002a, SDD-015 §2/§4.3, ADR-016 §4): a cota de cada membro é a SOMA do
 * rateio gravado por lançamento (`transaction_splits.amountInCents`); `paid`, acertos, saldo,
 * sugestões e status são os do LEGACY. Nunca soma silenciosamente errado: despesa sem rateio ou com
 * Σ ≠ valor lança `SplitInconsistentError`.
 */
export type StoredExpenseInput = ExpenseInput & {
  splits: Array<{ memberId: string; amountInCents: number }>;
};

export type StoredSettlementInput = {
  period: Period;
  members: MemberInput[];
  expenses: StoredExpenseInput[];
  settlements: SettledInput[];
};

export class SplitInconsistentError extends Error {
  constructor(
    readonly expenseId: string,
    readonly reason: string,
  ) {
    super(`Rateio inconsistente na despesa ${expenseId}: ${reason}`);
    this.name = "SplitInconsistentError";
  }
}

export function computeSettlementStored(i: StoredSettlementInput): SettlementResult {
  const everyone = [...i.members].sort(byOrdinal);
  // quem pagou ou recebeu rateio no período sempre entra (crédito/cota preservados)
  const involved = new Set<string>();
  for (const e of i.expenses) {
    involved.add(e.payerMemberId);
    for (const s of e.splits) involved.add(s.memberId);
  }
  const members = everyone.filter((m) => isPresent(m, i.period) || involved.has(m.id));
  const expenses = [...i.expenses].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const paid = new Map(members.map((m) => [m.id, 0]));
  const quota = new Map(members.map((m) => [m.id, 0]));
  const adjustment = new Map(members.map((m) => [m.id, 0]));
  let totalShared = 0;

  for (const e of expenses) {
    if (e.splits.length === 0) throw new SplitInconsistentError(e.id, "sem rateio");
    const sum = e.splits.reduce((acc, s) => acc + s.amountInCents, 0);
    if (sum !== e.amountInCents) {
      throw new SplitInconsistentError(e.id, `Σ ${sum} ≠ valor ${e.amountInCents}`);
    }
    totalShared += e.amountInCents;
    paid.set(e.payerMemberId, (paid.get(e.payerMemberId) ?? 0) + e.amountInCents);
    for (const s of e.splits) quota.set(s.memberId, (quota.get(s.memberId) ?? 0) + s.amountInCents);
  }

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
