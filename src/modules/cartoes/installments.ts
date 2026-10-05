// US-040 (SDD-014 §2/§4.1, ADR-017/020). PURO: sem Prisma, sem relógio. `today`/datas entram como argumento.
import { addMonthsToRef, type DateISO, invoiceDates, invoiceRefFor } from "@/modules/cartoes/cycle";

export const MAX_INSTALLMENTS = 24;
/** Vira `true` no commit da US-042 (rateio por parcela, motor STORED). */
export const INSTALLMENT_SPLIT_RELEASED = false;

export type InstallmentDraft = {
  no: number;
  amountInCents: number;
  /** Data nominal (exibida e usada na ordenação do Extrato). */
  occurredOn: DateISO;
  /** "YYYY-MM" (mês de fechamento). */
  invoiceRef: string;
  /** closingDate da fatura (INFORMATIVA: o banco recalcula; usada na prévia e nos testes). */
  competenceOn: DateISO;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** base = ⌊total ÷ n⌋; toda a sobra vai para a parcela 1 (RN-003.4). */
export function splitInstallments(totalInCents: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count deve ser >= 1");
  if (!Number.isInteger(totalInCents) || totalInCents < count) {
    throw new RangeError("total deve ter ao menos 1 centavo por parcela");
  }
  const base = Math.floor(totalInCents / count);
  const rest = totalInCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}

/** Soma `months` ao ano/mês de `date` e limita o dia ao fim do mês. Sempre a partir da data ORIGINAL. */
export function addMonthsClamped(date: DateISO, months: number): DateISO {
  const ref = addMonthsToRef(date.slice(0, 7), months);
  const [y, m] = ref.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), lastDay);
  return `${ref}-${pad(day)}`;
}

export function buildInstallments(i: {
  totalInCents: number;
  count: number;
  purchaseOn: DateISO;
  closingDay: number;
  dueDay: number;
}): InstallmentDraft[] {
  if (i.count < 2) throw new RangeError("Parcelamento exige 2 ou mais parcelas");
  const amounts = splitInstallments(i.totalInCents, i.count);
  const ref1 = invoiceRefFor(i.purchaseOn, i.closingDay);
  return amounts.map((amountInCents, idx) => {
    const invoiceRef = addMonthsToRef(ref1, idx);
    return {
      no: idx + 1,
      amountInCents,
      occurredOn: addMonthsClamped(i.purchaseOn, idx),
      invoiceRef,
      competenceOn: invoiceDates(invoiceRef, i.closingDay, i.dueDay).closingDate,
    };
  });
}

export type InstallmentPreview = {
  count: number;
  firstInCents: number;
  othersInCents: number;
  sameAmount: boolean;
  firstInvoiceRef: string;
};

export function previewInstallments(i: {
  totalInCents: number;
  count: number;
  purchaseOn: DateISO;
  closingDay: number;
}): InstallmentPreview {
  const amounts = splitInstallments(i.totalInCents, i.count);
  const first = amounts[0] as number;
  const others = (amounts[1] ?? first) as number;
  return {
    count: i.count,
    firstInCents: first,
    othersInCents: others,
    sameAmount: first === others,
    firstInvoiceRef: invoiceRefFor(i.purchaseOn, i.closingDay),
  };
}
