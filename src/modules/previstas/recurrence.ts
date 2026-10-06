import type { DateISO } from "@/lib/dates";

/** Mês civil `YYYY-MM` (ADR-025, SDD-019 §3.2). Funções puras, sem fuso nem relógio. */
export type MonthISO = `${number}-${number}`;

const pad = (n: number) => String(n).padStart(2, "0");

export const monthOf = (d: DateISO): MonthISO => d.slice(0, 7) as MonthISO;

const parts = (m: MonthISO): [number, number] => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return [y, mo];
};

export function addMonths(m: MonthISO, n: number): MonthISO {
  const [y, mo] = parts(m);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}` as MonthISO;
}

export function lastDayOfMonth(m: MonthISO): number {
  const [y, mo] = parts(m);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Vencimento da ocorrência: dia pedido, ou o último dia do mês quando ele não existe (29–31). */
export function occurrenceDueOn(month: MonthISO, day: number): DateISO {
  return `${month}-${pad(Math.min(day, lastDayOfMonth(month)))}`;
}

/** "Por N meses" conta a partir do início (`start + N − 1`). */
export function endMonthFromCount(startMonth: MonthISO, n: number): MonthISO {
  if (!Number.isInteger(n) || n < 1) throw new Error("n deve ser inteiro >= 1");
  return addMonths(startMonth, n - 1);
}

/**
 * Meses a materializar: de max(início, já gerado + 1) até min(fim, mês corrente + horizonte − 1).
 * Série encerrada não gera.
 */
export function monthsToGenerate(
  s: {
    startMonth: MonthISO;
    endMonth: MonthISO | null;
    generatedThroughMonth: MonthISO | null;
    endedAt: Date | null;
  },
  currentMonth: MonthISO,
  horizon = 12,
): MonthISO[] {
  if (s.endedAt) return [];
  const from =
    s.generatedThroughMonth && addMonths(s.generatedThroughMonth, 1) > s.startMonth
      ? addMonths(s.generatedThroughMonth, 1)
      : s.startMonth;
  const cap = addMonths(currentMonth, horizon - 1);
  const to = s.endMonth && s.endMonth < cap ? s.endMonth : cap;
  const out: MonthISO[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Quantidade de meses de `start` a `end` inclusive (para exibir "por N meses"). */
export function monthSpan(start: MonthISO, end: MonthISO): number {
  const [y1, m1] = parts(start);
  const [y2, m2] = parts(end);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}
