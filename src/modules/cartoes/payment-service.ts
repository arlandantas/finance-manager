import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { formatInvoiceLabel, invoiceStatus, openInvoiceRef } from "@/modules/cartoes/cycle";
import { getInvoice } from "@/modules/cartoes/invoice-service";
import { activePayments, cardUsage, invoiceTotals } from "@/modules/cartoes/queries";
import { cartoesRepo } from "@/modules/cartoes/repo";
import type { PayInvoiceParsed, PayInvoiceResponse } from "@/modules/cartoes/schemas";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { lockAccountsForPosting } from "@/modules/contas/lock";
import { loadTransactionDTOs } from "@/modules/transacoes/service";

const CARD_NOT_FOUND = "Cartão não encontrado.";

type LockedInvoice = { id: string; closingDate: string; dueDate: string };

/** `SELECT … FOR UPDATE` da fatura (cartão da família); `null` se não materializada. */
async function lockInvoice(
  tx: Tx,
  familyId: string,
  cardId: string,
  ref: string,
): Promise<LockedInvoice | null> {
  const rows = await tx.$queryRaw<LockedInvoice[]>`
    SELECT id, to_char("closingDate", 'YYYY-MM-DD') AS "closingDate",
           to_char("dueDate", 'YYYY-MM-DD') AS "dueDate"
    FROM card_invoices
    WHERE "cardId" = ${cardId}::uuid AND "familyId" = ${familyId}::uuid AND "referenceMonth" = ${ref}
    FOR UPDATE`;
  return rows[0] ?? null;
}

async function cardAfter(tx: Tx, ctx: RequestContext, card: { id: string; limitInCents: bigint }) {
  const used = (await cardUsage(tx, ctx.familyId, [card.id])).get(card.id) ?? 0;
  return { id: card.id, usedInCents: used, availableInCents: toCents(card.limitInCents) - used };
}

/** US-017b (SDD-008 §4.5): pagamento integral, uma perna `INVOICE_PAYMENT` DEBIT na conta. */
export async function payInvoice(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  ref: string,
  input: PayInvoiceParsed,
): Promise<PayInvoiceResponse> {
  const repo = cartoesRepo(tx, ctx.familyId);
  const card = await repo.findById(cardId);
  if (!card) throw notFound(CARD_NOT_FOUND);
  const today = todayInFamilyTz(ctx.clock);
  const openRef = openInvoiceRef(today, card.closingDay);

  const invoice = await lockInvoice(tx, ctx.familyId, cardId, ref);
  if (!invoice) {
    // Sem fatura materializada: só a aberta existe (virtual) e não é pagável; as demais são 404.
    if (ref === openRef) {
      throw unprocessable(
        "INVOICE_NOT_CLOSED",
        "A fatura ainda está aberta e só pode ser paga depois do fechamento",
      );
    }
    throw notFound("Fatura não encontrada.");
  }
  if ((await activePayments(tx, ctx.familyId, [invoice.id])).has(invoice.id)) {
    throw conflict("INVOICE_ALREADY_PAID", "Esta fatura já foi paga");
  }
  const { status } = invoiceStatus({ ...invoice, paid: false }, today);
  if (status !== "CLOSED") {
    throw unprocessable(
      "INVOICE_NOT_CLOSED",
      "A fatura ainda está aberta e só pode ser paga depois do fechamento",
    );
  }
  const total =
    (await invoiceTotals(tx, ctx.familyId, [invoice.id])).get(invoice.id)?.totalInCents ?? 0;
  if (total === 0) {
    throw unprocessable("INVOICE_EMPTY", "Esta fatura não tem compras para pagar");
  }
  if (total !== input.expectedTotalInCents) {
    throw conflict("INVOICE_TOTAL_CHANGED", "O valor da fatura mudou. Confira e tente de novo.", {
      currentTotalInCents: total,
    });
  }
  const paidOn = input.paidOn ?? today;
  if (compareDate(paidOn, today) > 0) {
    const message = "A data do pagamento não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "paidOn", message }]);
  }
  if (compareDate(paidOn, invoice.closingDate) <= 0) {
    const message = "A data do pagamento deve ser posterior ao fechamento da fatura";
    throw unprocessable("PAYMENT_BEFORE_CLOSING", message, [{ path: "paidOn", message }]);
  }
  const account = await tx.bankAccount.findFirst({
    where: { id: input.accountId, familyId: ctx.familyId, deletedAt: null },
    select: { id: true },
  });
  if (account) await lockAccountsForPosting(tx, ctx.familyId, [account.id]);
  if (!account) {
    throw unprocessable("INVALID_REFERENCE", "Escolha a conta de pagamento", [
      { path: "accountId", message: "Escolha a conta de pagamento" },
    ]);
  }

  let paymentId: string;
  try {
    const row = await tx.transaction.create({
      data: {
        familyId: ctx.familyId,
        kind: "INVOICE_PAYMENT",
        direction: "DEBIT",
        accountId: account.id,
        cardId: card.id,
        invoiceId: invoice.id,
        amountInCents: BigInt(total),
        occurredOn: new Date(`${paidOn}T00:00:00Z`),
        description: `Pagamento da fatura ${card.name} - ${formatInvoiceLabel(ref)}`,
        note: input.note ?? null,
        authorMemberId: ctx.memberId,
        isSharedExpense: false,
      },
    });
    paymentId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("INVOICE_ALREADY_PAID", "Esta fatura já foi paga");
    throw e;
  }
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: paymentId,
    revision: 1,
    action: "CREATE",
    actorMemberId: ctx.memberId,
    changes: [
      {
        field: "*",
        from: null,
        to: {
          kind: "INVOICE_PAYMENT",
          accountId: account.id,
          cardId: card.id,
          invoiceRef: ref,
          amountInCents: total,
          occurredOn: paidOn,
        },
      },
    ],
  });
  const balance = (await accountBalances(tx, ctx.familyId, [account.id])).get(account.id) ?? 0;
  const [payment] = await loadTransactionDTOs(tx, ctx, [paymentId]);
  return {
    invoice: (await getInvoice(tx, ctx, cardId, ref)).invoice,
    payment: payment as NonNullable<typeof payment>,
    account: { id: account.id, balanceInCents: balance },
    card: await cardAfter(tx, ctx, card),
  };
}

/** SDD-008 §4.7: desfaz o pagamento (UNDONE + revisão UNDO); saldo e uso voltam por derivação. */
export async function undoInvoicePayment(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  ref: string,
  version: number,
) {
  const repo = cartoesRepo(tx, ctx.familyId);
  const card = await repo.findById(cardId);
  if (!card) throw notFound(CARD_NOT_FOUND);
  const invoice = await lockInvoice(tx, ctx.familyId, cardId, ref);
  if (!invoice) throw notFound("Fatura não encontrada.");
  const active = (await activePayments(tx, ctx.familyId, [invoice.id])).get(invoice.id);
  if (!active) throw conflict("INVOICE_NOT_PAID", "Esta fatura não está paga");
  const res = await tx.transaction.updateMany({
    where: { id: active.id, familyId: ctx.familyId, version, deletedAt: null },
    data: {
      deletedAt: ctx.clock.now(),
      deletedByMemberId: ctx.memberId,
      deletionReason: "UNDONE",
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) {
    const fresh = await tx.transaction.findFirst({ where: { id: active.id } });
    throw conflict(
      "VERSION_CONFLICT",
      "Este pagamento foi alterado por outra pessoa. Recarregue para continuar.",
      { currentVersion: fresh?.version },
    );
  }
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: active.id,
    revision: version + 1,
    action: "UNDO",
    actorMemberId: ctx.memberId,
    changes: [{ field: "deletionReason", from: null, to: "UNDONE" }],
  });
  const accountId = active.accountId as string;
  const balance = (await accountBalances(tx, ctx.familyId, [accountId])).get(accountId) ?? 0;
  return {
    invoice: (await getInvoice(tx, ctx, cardId, ref)).invoice,
    account: { id: accountId, balanceInCents: balance },
    card: await cardAfter(tx, ctx, card),
  };
}
