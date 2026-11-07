import type { DateISO } from "@/lib/dates";
import { invoiceRefFor } from "@/modules/cartoes/cycle";
import {
  addMonths,
  endMonthFromCount,
  type MonthISO,
  monthOf,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";

/** Datas da assinatura (ADR-036). Puro: sem relógio, banco nem fuso; `today` vem do chamador. */
export type SubscriptionEnd = { type: "NONE" } | { type: "COUNT"; count: number };

/** Dia da cobrança no mês; 29..31 viram o último dia em meses curtos. */
export const chargeDateOf = (month: MonthISO, day: number): DateISO => occurrenceDueOn(month, day);

/** Primeira cobrança: 1º `chargeDateOf(M) >= today` com `M >= startMonth` (nunca retroativa). */
export function firstChargeOn(startMonth: MonthISO, day: number, today: DateISO): DateISO {
  let month = startMonth;
  for (;;) {
    const on = chargeDateOf(month, day);
    if (on >= today) return on;
    month = addMonths(month, 1);
  }
}

/** Próxima cobrança depois de `month`; nula quando passa do último mês cobrado. */
export function nextAfter(
  month: MonthISO,
  day: number,
  endMonth: MonthISO | null,
): { month: MonthISO; on: DateISO } | null {
  const next = addMonths(month, 1);
  if (endMonth !== null && next > endMonth) return null;
  return { month: next, on: chargeDateOf(next, day) };
}

/** Último mês cobrado ("após N cobranças" conta a partir do mês da primeira). */
export function endMonthOfSubscription(firstOn: DateISO, end: SubscriptionEnd): MonthISO | null {
  return end.type === "COUNT" ? endMonthFromCount(monthOf(firstOn), end.count) : null;
}

export type AmountRow = { fromMonth: MonthISO; amountInCents: number; createdAt: Date };

/** Valor do mês: maior `fromMonth <= month`; empate = `createdAt` mais recente. Sem vigência => null. */
export function amountFor(month: MonthISO, rows: AmountRow[]): number | null {
  let best: AmountRow | null = null;
  for (const r of rows) {
    if (r.fromMonth > month) continue;
    if (
      !best ||
      r.fromMonth > best.fromMonth ||
      (r.fromMonth === best.fromMonth && r.createdAt.getTime() > best.createdAt.getTime())
    ) {
      best = r;
    }
  }
  return best ? best.amountInCents : null;
}

/**
 * "Assinaturas previstas neste ciclo" (US-096c): Σ valor das ativas cuja próxima cobrança cai na
 * fatura `ref` do cartão (`invoiceRefFor`). Informativo: nunca entra no total da fatura.
 */
export function projectedInCycle(
  subs: Array<{
    currentAmountInCents: number;
    nextChargeOn: string | null;
    endedOn: string | null;
  }>,
  ref: string,
  closingDay: number,
): number {
  let total = 0;
  for (const s of subs) {
    if (s.endedOn !== null || s.nextChargeOn === null) continue;
    if (invoiceRefFor(s.nextChargeOn, closingDay) === ref) total += s.currentAmountInCents;
  }
  return total;
}
