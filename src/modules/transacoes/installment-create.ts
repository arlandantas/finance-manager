import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, fromDbDate, toDbDate, todayInFamilyTz } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import {
  buildRemainingInstallments,
  INSTALLMENT_SPLIT_RELEASED,
} from "@/modules/cartoes/installments";
import { getOrCreateInvoice, type InvoiceRow } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { recordRevision } from "@/modules/contas/ledger";
import { assertCanShare } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { splitOf } from "@/modules/split/split-input";
import { attachTagsOnCreate } from "@/modules/tags/service";
import { loadInstallmentPlanDTO } from "@/modules/transacoes/installment-plan";
import { assertPersonalForSelf } from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  CreateTransactionParsed,
  CreateTransactionResponse,
} from "@/modules/transacoes/schemas";
import { categoryRefOf, memberRefOf, toTransactionDTO } from "@/modules/transacoes/service";

type ExpenseInput = Extract<CreateTransactionParsed, { type: "EXPENSE" }>;

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

/**
 * US-040a (SDD-014 §4.2, ADR-017/020): compra no cartão em N parcelas = plano + N lançamentos,
 * uma por fatura, numa só transação (nada gravado se algo falhar). Chamado com `installments >= 2`.
 */
export async function createInstallmentPurchase(
  tx: Tx,
  ctx: RequestContext,
  input: ExpenseInput,
): Promise<CreateTransactionResponse> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava (a US-042 grava rateio por parcela)
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const paidBeforeApp = input.paidBeforeApp ?? 0;
  // US-065: com parcelas pagas a data é a ÂNCORA da próxima parcela (ADR-027); sem elas, a data da compra
  const purchaseOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;
  const count = input.installments;

  // 1) referências da família (cartão ativo, categoria ativa de despesa, pagador ativo)
  const card = input.cardId ? await repo.findCardForPosting(input.cardId) : null;
  if (!card) throw invalidRef("cardId", "Escolha um cartão");
  const category = await repo.findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  const payer = await repo.findMember(payerMemberId);
  if (!payer) throw invalidRef("payerMemberId", "Membro inválido");
  const shared = splitOf(input).mode !== "NONE"; // US-043
  await assertPersonalForSelf(tx, ctx, { isSharedExpense: shared, payerMemberId }); // SEC-026c; US-093b
  if (category.kind !== "EXPENSE") {
    throw unprocessable(
      "CATEGORY_KIND_MISMATCH",
      "A categoria não combina com o tipo do lançamento",
      [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
    );
  }
  if (compareDate(purchaseOn, today) > 0) {
    const message = "A data da compra não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }
  if (input.amountInCents < count) {
    throw unprocessable(
      "INSTALLMENT_TOTAL_TOO_SMALL",
      "O valor total precisa ter ao menos 1 centavo por parcela",
      [
        {
          path: "amountInCents",
          message: "O valor total precisa ter ao menos 1 centavo por parcela",
        },
      ],
    );
  }

  // 2) guarda da divisão: só depois da US-042 (rateio por parcela, motor STORED)
  if (shared) {
    await assertCanShare(tx, ctx); // acerto desligado => SETTLEMENT_DISABLED
    if (!INSTALLMENT_SPLIT_RELEASED) {
      throw unprocessable(
        "INSTALLMENT_SPLIT_UNAVAILABLE",
        "Dividir compras parceladas ainda não está disponível",
        [
          {
            path: "isSharedExpense",
            message: "Dividir compras parceladas ainda não está disponível",
          },
        ],
      );
    }
  }

  const drafts = buildRemainingInstallments({
    totalInCents: input.amountInCents,
    count,
    paidBeforeApp,
    anchorOn: purchaseOn,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  });

  // 3) faturas em ordem crescente de `ref` (FOR UPDATE; o cartão fica FOR SHARE em cada chamada)
  const invoices: InvoiceRow[] = [];
  for (const d of drafts) {
    invoices.push(await getOrCreateInvoice(tx, ctx.familyId, card, d.invoiceRef));
  }
  const paid = await activePayments(
    tx,
    ctx.familyId,
    invoices.map((i) => i.id),
  );
  const firstPaid = invoices.find((i) => paid.has(i.id));
  if (firstPaid) {
    throw unprocessable(
      "INVOICE_ALREADY_PAID",
      `A fatura de ${formatInvoiceLabel(firstPaid.ref)} já foi paga. Use uma data posterior ao fechamento.`,
      { ref: firstPaid.ref },
    );
  }

  // 4) plano e parcelas
  const description = input.description ?? category.name;
  const plan = await tx.installmentPlan.create({
    data: {
      familyId: ctx.familyId,
      cardId: card.id,
      totalInCents: fromCents(input.amountInCents),
      installmentCount: count,
      paidBeforeAppCount: paidBeforeApp,
      purchaseOn: toDbDate(purchaseOn),
      description,
      note: input.note ?? null,
      categoryId: category.id,
      payerMemberId,
      authorMemberId: ctx.memberId,
    },
  });
  const rows = await tx.transaction.createManyAndReturn({
    data: drafts.map((d, i) => ({
      familyId: ctx.familyId,
      kind: "EXPENSE" as const,
      direction: "DEBIT" as const,
      accountId: null,
      cardId: card.id,
      invoiceId: (invoices[i] as { id: string }).id,
      categoryId: category.id,
      amountInCents: fromCents(d.amountInCents),
      occurredOn: toDbDate(d.occurredOn),
      description,
      note: input.note ?? null,
      payerMemberId,
      authorMemberId: ctx.memberId,
      isSharedExpense: false,
      installmentPlanId: plan.id,
      installmentNo: d.no,
      installmentCount: count,
    })),
  });
  rows.sort((a, b) => (a.installmentNo as number) - (b.installmentNo as number));
  // US-045 (RN-013.5): a tag vale para TODAS as parcelas; o plano já está criado/travado nesta transação
  const tags = await attachTagsOnCreate(
    tx,
    ctx,
    rows.map((r) => r.id),
    input.tags,
  );

  // 5) revisão CREATE de cada parcela
  for (const [i, row] of rows.entries()) {
    const d = drafts[i] as (typeof drafts)[number];
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: row.id,
      revision: 1,
      action: "CREATE",
      actorMemberId: ctx.memberId,
      changes: [
        {
          field: "*",
          from: null,
          to: {
            kind: "EXPENSE",
            accountId: null,
            cardId: card.id,
            invoiceRef: d.invoiceRef,
            categoryId: category.id,
            amountInCents: d.amountInCents,
            occurredOn: d.occurredOn,
            competenceOn: fromDbDate(row.competenceOn),
            description,
            payerMemberId,
            isSharedExpense: false,
            installment: { planId: plan.id, no: d.no, count, paidBeforeApp },
            ...(tags.length > 0 ? { tags: tags.map((t) => t.name) } : {}),
          },
        },
      ],
    });
  }

  // 6) resposta: 1ª parcela lançada, plano e limite
  const first = rows[0] as (typeof rows)[number];
  const inv1 = invoices[0] as (typeof invoices)[number];
  const members = new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const));
  const transaction = toTransactionDTO(first, {
    tags,
    account: null,
    card: { id: card.id, name: card.name, color: card.color },
    invoice: { ref: inv1.ref, closingDate: inv1.closingDate, dueDate: inv1.dueDate },
    category: categoryRefOf(category),
    members,
  });
  const used = (await cardUsage(tx, ctx.familyId, [card.id])).get(card.id) ?? 0;
  return {
    transaction,
    plan: await loadInstallmentPlanDTO(tx, ctx, plan.id),
    card: { id: card.id, usedInCents: used, availableInCents: toCents(card.limitInCents) - used },
  };
}
