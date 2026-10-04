import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { invoiceDates, invoiceStatus, openInvoiceRef } from "@/modules/cartoes/cycle";
import type { InvoiceSummaryDTO } from "@/modules/cartoes/schemas";

// Consultas derivadas do cartão (SDD-008 §4.2): uma única implementação para Cartões, Home,
// resposta da compra e testes. Usa apenas o tipo `Tx` (sem importar `@/lib/db`).

const uuidList = (ids: string[]) => Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/** Usado por cartão (compras ativas em faturas sem pagamento ativo, §7.4). Cartões sem linhas = 0. */
export async function cardUsage(
  tx: Tx,
  familyId: string,
  cardIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>(cardIds.map((id) => [id, 0] as const));
  if (cardIds.length === 0) return map;
  const rows = await tx.$queryRaw<Array<{ cardId: string; used: bigint }>>`
    SELECT t."cardId", COALESCE(SUM(t."amountInCents"), 0)::bigint AS used
    FROM transactions t
    WHERE t."familyId" = ${familyId}::uuid AND t.kind = 'EXPENSE' AND t."cardId" IN (${uuidList(cardIds)})
      AND t."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transactions p
        WHERE p."invoiceId" = t."invoiceId" AND p.kind = 'INVOICE_PAYMENT' AND p."deletedAt" IS NULL)
    GROUP BY t."cardId"`;
  for (const r of rows) map.set(r.cardId, toCents(r.used));
  return map;
}

/** Cartões que já têm fatura materializada (trava dos dias do ciclo, D-PO-07). */
export async function cardsWithInvoices(
  tx: Tx,
  familyId: string,
  cardIds: string[],
): Promise<Set<string>> {
  if (cardIds.length === 0) return new Set();
  const rows = await tx.cardInvoice.findMany({
    where: { familyId, cardId: { in: cardIds } },
    select: { cardId: true },
    distinct: ["cardId"],
  });
  return new Set(rows.map((r) => r.cardId));
}

export type InvoiceTotals = { totalInCents: number; count: number };

/** Total e quantidade de compras ativas por fatura (§4.2). Faturas sem compras = 0. */
export async function invoiceTotals(
  tx: Tx,
  familyId: string,
  invoiceIds: string[],
): Promise<Map<string, InvoiceTotals>> {
  const map = new Map<string, InvoiceTotals>(
    invoiceIds.map((id) => [id, { totalInCents: 0, count: 0 }] as const),
  );
  if (invoiceIds.length === 0) return map;
  const rows = await tx.$queryRaw<Array<{ invoiceId: string; total: bigint; n: number }>>`
    SELECT t."invoiceId", COALESCE(SUM(t."amountInCents"), 0)::bigint AS total, count(*)::int AS n
    FROM transactions t
    WHERE t."familyId" = ${familyId}::uuid AND t."invoiceId" IN (${uuidList(invoiceIds)})
      AND t.kind = 'EXPENSE' AND t."deletedAt" IS NULL
    GROUP BY t."invoiceId"`;
  for (const r of rows) map.set(r.invoiceId, { totalInCents: toCents(r.total), count: r.n });
  return map;
}

/** Subtotal por `payerMemberId` de uma fatura (§7.4). */
export async function invoiceByMember(
  tx: Tx,
  familyId: string,
  invoiceId: string,
): Promise<Map<string, { totalInCents: number; count: number }>> {
  const rows = await tx.$queryRaw<Array<{ payerMemberId: string; total: bigint; n: number }>>`
    SELECT t."payerMemberId", SUM(t."amountInCents")::bigint AS total, count(*)::int AS n
    FROM transactions t
    WHERE t."familyId" = ${familyId}::uuid AND t."invoiceId" = ${invoiceId}::uuid
      AND t.kind = 'EXPENSE' AND t."deletedAt" IS NULL
    GROUP BY t."payerMemberId"`;
  return new Map(
    rows.map((r) => [r.payerMemberId, { totalInCents: toCents(r.total), count: r.n }] as const),
  );
}

export type ActivePayment = {
  id: string;
  invoiceId: string;
  accountId: string | null;
  occurredOn: string;
  amountInCents: number;
  version: number;
  authorMemberId: string;
};

/** Pagamento ativo por fatura (`kind = INVOICE_PAYMENT AND deletedAt IS NULL`). */
export async function activePayments(
  tx: Tx,
  familyId: string,
  invoiceIds: string[],
): Promise<Map<string, ActivePayment>> {
  const map = new Map<string, ActivePayment>();
  if (invoiceIds.length === 0) return map;
  const rows = await tx.transaction.findMany({
    where: { familyId, kind: "INVOICE_PAYMENT", deletedAt: null, invoiceId: { in: invoiceIds } },
  });
  for (const r of rows) {
    if (!r.invoiceId) continue;
    map.set(r.invoiceId, {
      id: r.id,
      invoiceId: r.invoiceId,
      accountId: r.accountId,
      occurredOn: fromDbDate(r.occurredOn),
      amountInCents: toCents(r.amountInCents),
      version: r.version,
      authorMemberId: r.authorMemberId,
    });
  }
  return map;
}

/** Monta o resumo; linha nula => fatura virtual (datas por `invoiceDates`, total 0). */
export function buildInvoiceSummary(
  card: { id: string; closingDay: number; dueDay: number },
  ref: string,
  row: { closingDate: string; dueDate: string } | null,
  totals: InvoiceTotals,
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

type CardLite = { id: string; closingDay: number; dueDay: number };

/**
 * Resumos por cartão: fatura aberta hoje (virtual se não materializada) e faturas pagáveis
 * (CLOSED, não pagas, total > 0), mais antigas primeiro.
 */
export async function cardInvoiceSummaries(
  tx: Tx,
  familyId: string,
  cards: CardLite[],
  today: string,
): Promise<Map<string, { open: InvoiceSummaryDTO; payable: InvoiceSummaryDTO[] }>> {
  const out = new Map<string, { open: InvoiceSummaryDTO; payable: InvoiceSummaryDTO[] }>();
  if (cards.length === 0) return out;
  const rows = await tx.cardInvoice.findMany({
    where: {
      familyId,
      cardId: { in: cards.map((c) => c.id) },
      OR: [
        { closingDate: { lt: new Date(`${today}T00:00:00Z`) } },
        ...cards.map((c) => ({
          cardId: c.id,
          referenceMonth: openInvoiceRef(today, c.closingDay),
        })),
      ],
    },
    orderBy: [{ referenceMonth: "asc" }],
  });
  const ids = rows.map((r) => r.id);
  const totals = await invoiceTotals(tx, familyId, ids);
  const payments = await activePayments(tx, familyId, ids);
  const zero = { totalInCents: 0, count: 0 };
  const summarize = (card: CardLite, r: (typeof rows)[number]) =>
    buildInvoiceSummary(
      card,
      r.referenceMonth,
      { closingDate: fromDbDate(r.closingDate), dueDate: fromDbDate(r.dueDate) },
      totals.get(r.id) ?? zero,
      payments.has(r.id) ? { paidOn: (payments.get(r.id) as ActivePayment).occurredOn } : null,
      today,
    );
  for (const card of cards) {
    const openRef = openInvoiceRef(today, card.closingDay);
    const mine = rows.filter((r) => r.cardId === card.id);
    const openRow = mine.find((r) => r.referenceMonth === openRef);
    const open = openRow
      ? summarize(card, openRow)
      : buildInvoiceSummary(card, openRef, null, zero, null, today);
    const payable = mine
      .filter((r) => r.referenceMonth !== openRef)
      .map((r) => summarize(card, r))
      .filter((s) => s.status === "CLOSED" && s.totalInCents > 0);
    out.set(card.id, { open, payable });
  }
  return out;
}

export { openInvoiceRef };
