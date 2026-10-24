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

export type RemainingInstallmentsInput = {
  totalInCents: number;
  count: number; // plano COMPLETO (2..24)
  paidBeforeApp: number; // 0..count-1
  /** P = 0: data da compra; P >= 1: data na fatura da próxima parcela. */
  anchorOn: DateISO;
  closingDay: number;
  dueDay: number;
};

/** US-065 (SDD-020 §2, ADR-027): rascunhos SÓ das parcelas a lançar (no = P+1..N). P = 0 ⇒ `buildInstallments`. */
export function buildRemainingInstallments(i: RemainingInstallmentsInput): InstallmentDraft[] {
  const amounts = splitInstallments(i.totalInCents, i.count);
  const p = i.paidBeforeApp;
  if (!Number.isInteger(p) || p < 0 || p >= i.count) {
    throw new RangeError("paidBeforeApp deve ser inteiro entre 0 e count - 1");
  }
  const remaining = i.count - p;
  const ref1 = invoiceRefFor(i.anchorOn, i.closingDay);
  return Array.from({ length: remaining }, (_, j) => {
    const invoiceRef = addMonthsToRef(ref1, j);
    return {
      no: p + j + 1,
      amountInCents: amounts[p + j] as number,
      occurredOn: addMonthsClamped(i.anchorOn, j),
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
  /** 0 = comportamento anterior à US-065. */
  paidBeforeApp: number;
  remainingCount: number;
  nextNo: number;
  /** Valor de cada restante quando P >= 1 (todas iguais). */
  remainingEachInCents: number;
  /** Σ das parcelas a lançar. */
  remainingTotalInCents: number;
  /** P >= 1 e o total não divide por N: a sobra ficou na 1ª parcela, já paga. */
  remainderOnPaidParcel: boolean;
};

export function previewInstallments(i: {
  totalInCents: number;
  count: number;
  /** P = 0: data da compra; P >= 1: âncora da próxima parcela. */
  purchaseOn: DateISO;
  closingDay: number;
  paidBeforeApp?: number;
}): InstallmentPreview {
  const p = i.paidBeforeApp ?? 0;
  if (!Number.isInteger(p) || p < 0 || p >= i.count) {
    throw new RangeError("paidBeforeApp deve ser inteiro entre 0 e count - 1");
  }
  const amounts = splitInstallments(i.totalInCents, i.count);
  const first = amounts[0] as number;
  const others = (amounts[1] ?? first) as number;
  const rest = amounts.slice(p);
  return {
    count: i.count,
    firstInCents: first,
    othersInCents: others,
    sameAmount: first === others,
    firstInvoiceRef: invoiceRefFor(i.purchaseOn, i.closingDay),
    paidBeforeApp: p,
    remainingCount: i.count - p,
    nextNo: p + 1,
    remainingEachInCents: rest[rest.length - 1] as number,
    remainingTotalInCents: rest.reduce((a, b) => a + b, 0),
    remainderOnPaidParcel: p >= 1 && i.totalInCents % i.count !== 0,
  };
}
