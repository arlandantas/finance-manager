import type { DateISO } from "@/lib/dates";

// Tipos e funções COMUNS aos motores do acerto (EN-002a, SDD-015 §2). Movidos de `settlement.ts` sem
// mudança de lógica: o motor LEGACY (`settlement-legacy.ts`) e o STORED (`settlement.ts`) os usam.

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

export const byOrdinal = <T extends { ordinal: number; id: string }>(a: T, b: T) =>
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
