const SP = "America/Sao_Paulo";
const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP,
  hour: "2-digit",
  minute: "2-digit",
});

export const brDate = (iso: string) => DATE.format(new Date(iso));
export const brTime = (iso: string) => TIME.format(new Date(iso));

/** "hoje 14:32" ou "23/10/2026 14:32" (fuso de São Paulo). */
export function brWhen(iso: string, now = new Date()): string {
  return brDate(iso) === DATE.format(now) ? `hoje ${brTime(iso)}` : `${brDate(iso)} ${brTime(iso)}`;
}
