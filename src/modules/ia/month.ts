// SDD-021 §1 "Mês": o contador de IA usa o mês civil em America/Sao_Paulo (não o `cutDay`). PURO.

const SP = "America/Sao_Paulo";

/** `YYYY-MM` do instante no fuso dado. */
export function monthKeyIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export const aiMonthKey = (at: Date) => monthKeyIn(SP, at);

/** 1º dia do mês seguinte (`YYYY-MM-DD`): quando o teto "volta a liberar". */
export function resetsOn(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
