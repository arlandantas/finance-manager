import { notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import type { MemberRef } from "@/lib/schemas";
import { invoiceStatus, openInvoiceRef } from "@/modules/cartoes/cycle";
import {
  type ActivePayment,
  activePayments,
  buildInvoiceSummary,
  invoiceByMember,
  invoiceTotals,
} from "@/modules/cartoes/queries";
import { cartoesRepo } from "@/modules/cartoes/repo";
import type { InvoiceDTO, InvoiceSummaryDTO } from "@/modules/cartoes/schemas";
import { loadTransactionDTOs } from "@/modules/transacoes/service";

const CARD_NOT_FOUND = "Cartão não encontrado.";
const INVOICE_NOT_FOUND = "Fatura não encontrada.";

type CardRow = { id: string; closingDay: number; dueDay: number };

/** Faturas materializadas do cartão (mais recentes primeiro), mais a aberta hoje (virtual se preciso). */
async function summaries(
  tx: Tx,
  ctx: RequestContext,
  card: CardRow,
  today: string,
): Promise<{ list: InvoiceSummaryDTO[]; ids: Map<string, string> }> {
  const rows = await tx.cardInvoice.findMany({
    where: { familyId: ctx.familyId, cardId: card.id },
    orderBy: [{ referenceMonth: "desc" }],
  });
  const ids = rows.map((r) => r.id);
  const totals = await invoiceTotals(tx, ctx.familyId, ids);
  const payments = await activePayments(tx, ctx.familyId, ids);
  const zero = { totalInCents: 0, count: 0 };
  const idByRef = new Map(rows.map((r) => [r.referenceMonth, r.id] as const));
  const list = rows.map((r) =>
    buildInvoiceSummary(
      card,
      r.referenceMonth,
      { closingDate: fromDbDate(r.closingDate), dueDate: fromDbDate(r.dueDate) },
      totals.get(r.id) ?? zero,
      payments.has(r.id) ? { paidOn: (payments.get(r.id) as ActivePayment).occurredOn } : null,
      today,
    ),
  );
  const openRef = openInvoiceRef(today, card.closingDay);
  if (!list.some((s) => s.ref === openRef)) {
    list.unshift(buildInvoiceSummary(card, openRef, null, zero, null, today));
  }
  // Faturas materializadas posteriores à aberta (compras antecipadas não existem na R2) ficam de fora.
  return { list: list.filter((s) => s.ref <= openRef), ids: idByRef };
}

/** GET /cards/:id/invoices (SDD-008 §3.1): até 24, mais recentes primeiro. */
export async function listInvoices(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
): Promise<{ items: InvoiceSummaryDTO[] }> {
  const card = await cartoesRepo(tx, ctx.familyId).findById(cardId);
  if (!card) throw notFound(CARD_NOT_FOUND);
  const { list } = await summaries(tx, ctx, card, todayInFamilyTz(ctx.clock));
  return { items: list.slice(0, 24) };
}

function memberRefOf(m: {
  id: string;
  removedAt?: Date | null;
  user: { name: string | null; email: string; image: string | null };
}): MemberRef {
  return {
    id: m.id,
    name: m.user.name ?? localPart(m.user.email),
    image: m.user.image,
    ...(m.removedAt ? { removed: true as const } : {}),
  };
}

/** GET /cards/:id/invoices/:ref (SDD-008 §3.1). 404 se a ref é posterior à aberta ou não existe. */
export async function getInvoice(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  ref: string,
): Promise<{ invoice: InvoiceDTO }> {
  const repo = cartoesRepo(tx, ctx.familyId);
  const card = await repo.findById(cardId);
  if (!card) throw notFound(CARD_NOT_FOUND);
  const today = todayInFamilyTz(ctx.clock);
  const { list, ids } = await summaries(tx, ctx, card, today);
  const summary = list.find((s) => s.ref === ref);
  if (!summary) throw notFound(INVOICE_NOT_FOUND);

  const invoiceId = ids.get(ref) ?? null;
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId },
    include: { user: true },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  let purchases: InvoiceDTO["purchases"] = [];
  let byMember = new Map<string, { totalInCents: number; count: number }>();
  let payment: InvoiceDTO["payment"] = null;
  if (invoiceId) {
    const rows = await tx.transaction.findMany({
      where: { familyId: ctx.familyId, invoiceId, kind: "EXPENSE", deletedAt: null },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    purchases = await loadTransactionDTOs(
      tx,
      ctx,
      rows.map((r) => r.id),
    );
    byMember = await invoiceByMember(tx, ctx.familyId, invoiceId);
    const active = (await activePayments(tx, ctx.familyId, [invoiceId])).get(invoiceId);
    if (active) {
      const account = active.accountId
        ? await tx.bankAccount.findFirst({
            where: { id: active.accountId, familyId: ctx.familyId },
            select: { name: true },
          })
        : null;
      const by = members.find((m) => m.id === active.authorMemberId);
      payment = {
        transactionId: active.id,
        accountId: active.accountId ?? "",
        accountName: account?.name ?? "",
        paidOn: active.occurredOn,
        amountInCents: active.amountInCents,
        version: active.version,
        paidBy: by ? memberRefOf(by) : { id: active.authorMemberId, name: "Membro", image: null },
      };
    }
  }

  // Navegação: [mais antiga materializada .. aberta]; `list` está do mais recente ao mais antigo.
  const idx = list.findIndex((s) => s.ref === ref);
  const previousRef = list[idx + 1]?.ref ?? null;
  const nextRef = idx > 0 ? (list[idx - 1]?.ref ?? null) : null;
  const { status } = invoiceStatus(
    { closingDate: summary.closingDate, dueDate: summary.dueDate, paid: payment !== null },
    today,
  );
  return {
    invoice: {
      ...summary,
      purchases,
      byMember: members.map((m) => ({
        member: memberRefOf(m),
        totalInCents: byMember.get(m.id)?.totalInCents ?? 0,
        count: byMember.get(m.id)?.count ?? 0,
      })),
      payment,
      previousRef,
      nextRef,
      canPay: status === "CLOSED" && summary.totalInCents > 0,
    },
  };
}

export type PayableInvoice = {
  cardId: string;
  cardName: string;
  ref: string;
  dueDate: string;
  totalInCents: number;
  isOverdue: boolean;
};

/**
 * Faturas fechadas, não pagas e com total > 0 da família (consumido pelo agregador "A pagar" do
 * SDD-009). Mais antigas primeiro.
 */
export async function listPayableInvoices(
  tx: Tx,
  ctx: RequestContext,
  opts: { includeOpen?: boolean } = {},
): Promise<PayableInvoice[]> {
  const today = todayInFamilyTz(ctx.clock);
  const rows = await tx.cardInvoice.findMany({
    where: {
      familyId: ctx.familyId,
      ...(opts.includeOpen ? {} : { closingDate: { lt: new Date(`${today}T00:00:00Z`) } }),
    },
    include: { card: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  const ids = rows.map((r) => r.id);
  const totals = await invoiceTotals(tx, ctx.familyId, ids);
  const payments = await activePayments(tx, ctx.familyId, ids);
  return rows.flatMap((r) => {
    const total = totals.get(r.id)?.totalInCents ?? 0;
    if (total <= 0 || payments.has(r.id)) return [];
    const dueDate = fromDbDate(r.dueDate);
    return [
      {
        cardId: r.cardId,
        cardName: r.card.name,
        ref: r.referenceMonth,
        dueDate,
        totalInCents: total,
        isOverdue: today > dueDate,
      },
    ];
  });
}
