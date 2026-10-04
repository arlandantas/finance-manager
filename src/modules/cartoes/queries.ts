import type { Tx } from "@/lib/api/types";
import { invoiceDates, invoiceStatus, openInvoiceRef } from "@/modules/cartoes/cycle";
import type { InvoiceSummaryDTO } from "@/modules/cartoes/schemas";

// Consultas derivadas do cartão (SDD-008 §4.2): uma única implementação para Cartões, Home,
// resposta da compra e testes. Usa apenas o tipo `Tx` (sem importar `@/lib/db`).

/** Usado por cartão (compras ativas em faturas sem pagamento ativo). Cartões sem linhas = 0. */
export async function cardUsage(
  _tx: Tx,
  _familyId: string,
  cardIds: string[],
): Promise<Map<string, number>> {
  return new Map(cardIds.map((id) => [id, 0] as const));
}

/** Cartões que já têm fatura materializada (trava dos dias do ciclo, D-PO-07). */
export async function cardsWithInvoices(_tx: Tx, _familyId: string, _cardIds: string[]) {
  return new Set<string>();
}

/** Monta o resumo; linha nula => fatura virtual (datas por `invoiceDates`, total 0). */
export function buildInvoiceSummary(
  card: { id: string; closingDay: number; dueDay: number },
  ref: string,
  row: { closingDate: string; dueDate: string } | null,
  totals: { totalInCents: number; count: number },
  payment: { paidOn: string } | null,
  today: string,
): InvoiceSummaryDTO {
  const dates = row ?? invoiceDates(ref, card.closingDay, card.dueDay);
  const { status, isOverdue } = invoiceStatus({ ...dates, paid: payment !== null }, today);
  return {
    cardId: card.id,
    ref,
    closingDate: dates.closingDate,
    dueDate: dates.dueDate,
    status,
    isOverdue,
    totalInCents: totals.totalInCents,
    purchasesCount: totals.count,
    paidOn: payment?.paidOn ?? null,
  };
}

export { openInvoiceRef };
