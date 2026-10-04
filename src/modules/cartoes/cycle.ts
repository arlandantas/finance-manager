// Funções puras do ciclo do cartão (SDD-008 §4.1). Sem Prisma e sem relógio: `today` é argumento.
export type DateISO = string;

const pad = (n: number) => String(n).padStart(2, "0");
const parseRef = (ref: string): [number, number] => {
  const [y, m] = ref.split("-").map(Number) as [number, number];
  return [y, m];
};
const refOf = (y: number, m: number) => `${y}-${pad(m)}`;

/** "2026-12" + 1 => "2027-01"; "2026-01" + (-1) => "2025-12". */
export function addMonthsToRef(ref: string, n: number): string {
  const [y, m] = parseRef(ref);
  const total = y * 12 + (m - 1) + n;
  return refOf(Math.floor(total / 12), (((total % 12) + 12) % 12) + 1);
}

/** Mês de fechamento da fatura que recebe a compra: dia(date) <= closingDay ? ym(date) : ym(date)+1. */
export function invoiceRefFor(date: DateISO, closingDay: number): string {
  const ref = date.slice(0, 7);
  const day = Number(date.slice(8, 10));
  return day <= closingDay ? ref : addMonthsToRef(ref, 1);
}

/** closingDate = `${ref}-${dd}`; dueDate = dueDay > closingDay ? mesmo mês : mês seguinte. */
export function invoiceDates(
  ref: string,
  closingDay: number,
  dueDay: number,
): { closingDate: DateISO; dueDate: DateISO } {
  const dueRef = dueDay > closingDay ? ref : addMonthsToRef(ref, 1);
  return { closingDate: `${ref}-${pad(closingDay)}`, dueDate: `${dueRef}-${pad(dueDay)}` };
}

export type InvoiceStatus = "OPEN" | "CLOSED" | "PAID";

/** paga => PAID; hoje <= fechamento => OPEN; senão CLOSED; isOverdue = CLOSED && hoje > vencimento. */
export function invoiceStatus(
  i: { closingDate: DateISO; dueDate: DateISO; paid: boolean },
  today: DateISO,
): { status: InvoiceStatus; isOverdue: boolean } {
  if (i.paid) return { status: "PAID", isOverdue: false };
  if (today <= i.closingDate) return { status: "OPEN", isOverdue: false };
  return { status: "CLOSED", isOverdue: today > i.dueDate };
}

/** Referência da fatura aberta hoje. */
export function openInvoiceRef(today: DateISO, closingDay: number): string {
  return invoiceRefFor(today, closingDay);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" => "out/2026". */
export function formatInvoiceLabel(ref: string): string {
  const [y, m] = parseRef(ref);
  return `${MONTHS[m - 1]}/${y}`;
}

/** Frase do ciclo na lista de cartões (US-015). */
export function cycleSentence(closingDay: number, dueDay: number): string {
  const when = dueDay > closingDay ? "do mesmo mês" : "do mês seguinte";
  return `Fecha dia ${closingDay} · vence dia ${dueDay} ${when}`;
}

/** Frase explicativa ao vivo no drawer (US-015). */
export function cycleExplanation(closingDay: number, dueDay: number): string {
  const when = dueDay > closingDay ? "do mesmo mês" : "do mês seguinte";
  return `A fatura fecha no dia ${closingDay} e vence no dia ${dueDay} ${when}`;
}

/** Dica no drawer de despesa: "Entra na fatura de out/2026 · fecha 25/10". */
export function invoiceHint(date: DateISO, closingDay: number, dueDay: number): string {
  const ref = invoiceRefFor(date, closingDay);
  const { closingDate } = invoiceDates(ref, closingDay, dueDay);
  return `Entra na fatura de ${formatInvoiceLabel(ref)} · fecha ${closingDate.slice(8, 10)}/${closingDate.slice(5, 7)}`;
}
