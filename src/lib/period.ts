import { addDays, type DateISO } from "@/lib/dates";

export type Period = { key: string; start: DateISO; end: DateISO };

const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");

function startOf(year: number, month: number, cutDay: number): DateISO {
  return `${year}-${pad(month)}-${pad(cutDay)}`;
}

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const idx = year * 12 + (month - 1) + delta;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

function build(year: number, month: number, cutDay: number): Period {
  const start = startOf(year, month, cutDay);
  const [ny, nm] = shiftMonth(year, month, 1);
  return { key: `${year}-${pad(month)}`, start, end: addDays(startOf(ny, nm, cutDay), -1) };
}

/** Período (ADR-010): chave = mês de início do ciclo; cutDay=1 equivale ao mês-calendário. */
export function periodOf(date: DateISO, cutDay = 1): Period {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (d >= cutDay) return build(y, m, cutDay);
  const [py, pm] = shiftMonth(y, m, -1);
  return build(py, pm, cutDay);
}

export function periodFromKey(key: string, cutDay = 1): Period {
  const m = KEY_RE.exec(key);
  if (!m) throw new RangeError("Período inválido");
  return build(Number(m[1]), Number(m[2]), cutDay);
}

export function previousPeriod(p: Period, cutDay = 1): Period {
  const [y, m] = p.key.split("-").map(Number) as [number, number];
  const [py, pm] = shiftMonth(y, m, -1);
  return build(py, pm, cutDay);
}

export function nextPeriod(p: Period, cutDay = 1): Period {
  const [y, m] = p.key.split("-").map(Number) as [number, number];
  const [ny, nm] = shiftMonth(y, m, 1);
  return build(ny, nm, cutDay);
}
