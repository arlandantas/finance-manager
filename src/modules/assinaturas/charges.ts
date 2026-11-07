import type { PrismaClient } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { toCents } from "@/lib/money";
import { assinaturasRepo } from "@/modules/assinaturas/repo";
import { type AmountRow, amountFor, nextAfter } from "@/modules/assinaturas/schedule";
import { invoiceRefFor } from "@/modules/cartoes/cycle";
import { activePayments } from "@/modules/cartoes/queries";
import { type MonthISO, monthOf } from "@/modules/previstas/recurrence";
import { isSettlementEnabled } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { createExpenseCore } from "@/modules/transacoes/service";

// ADR-036 §4: lançamento preguiçoso, sem cron. No máx. 12 cobranças por chamada.
const MAX_PER_CALL = 12;

type Repo = ReturnType<typeof assinaturasRepo>;
type SubRow = Awaited<ReturnType<Repo["findManyByIds"]>>[number];

/** Decide e grava a cobrança do mês `month`; devolve `true` só se lançou compra (`POSTED`), `false` se pulou. */
async function chargeMonth(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  sub: SubRow,
  month: MonthISO,
  chargeOn: string,
  amounts: AmountRow[],
): Promise<boolean> {
  const card = await repo.lockCardState(sub.cardId);
  if (!card || card.archived) {
    await repo.insertCharge({
      subscriptionId: sub.id,
      month,
      chargeOn,
      status: "SKIPPED_CARD_ARCHIVED",
      transactionId: null,
    });
    return false;
  }
  const invoiceId = await repo.invoiceId(card.id, invoiceRefFor(chargeOn, card.closingDay));
  if (invoiceId && (await activePayments(tx, ctx.familyId, [invoiceId])).has(invoiceId)) {
    await repo.insertCharge({
      subscriptionId: sub.id,
      month,
      chargeOn,
      status: "SKIPPED_INVOICE_PAID",
      transactionId: null,
    });
    return false;
  }
  // US-099: dividida só com o acerto ligado AGORA; desligado => "Só meu" + `sharedDowngraded`, sem erro
  const downgraded = sub.isSharedExpense && !(await isSettlementEnabled(tx, ctx.familyId));
  const shared = sub.isSharedExpense && !downgraded;
  const amountInCents = amountFor(month, amounts);
  if (amountInCents === null) throw new Error("Assinatura sem valor vigente");
  const res = await createExpenseCore(
    tx,
    ctx,
    {
      type: "EXPENSE",
      cardId: sub.cardId,
      categoryId: sub.categoryId,
      amountInCents,
      occurredOn: chargeOn,
      payerMemberId: sub.payerMemberId,
      description: sub.description,
      isSharedExpense: shared,
      installments: 1,
      paidBeforeApp: 0,
    },
    {
      allowArchivedCategory: true,
      subscription: { subscriptionId: sub.id, authorMemberId: sub.authorMemberId },
    },
  );
  await repo.insertCharge({
    subscriptionId: sub.id,
    month,
    chargeOn,
    status: "POSTED",
    transactionId: res.transaction.id,
    sharedDowngraded: downgraded,
  });
  return true;
}

/**
 * Lança as cobranças vencidas (dia <= hoje) das assinaturas ativas. Atalho sem trava; se há vencida,
 * `lockFamilySplit` primeiro, depois advisory `subscriptions:{familyId}`, relê (outra aba pode ter lançado)
 * e a unicidade `(família, assinatura, mês)` em `subscription_charges` é a garantia final.
 * Devolve quantas compras foram lançadas (`POSTED`); puladas não entram na conta.
 */
export async function ensureSubscriptionCharges(
  tx: Tx,
  ctx: RequestContext,
  opts: { subscriptionId?: string } = {},
): Promise<number> {
  const repo = assinaturasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  if ((await repo.dueIds(today, opts.subscriptionId)).length === 0) return 0;
  await lockFamilySplit(tx, ctx.familyId);
  await repo.lockSubscriptions();
  const ids = await repo.dueIds(today, opts.subscriptionId);
  if (ids.length === 0) return 0;
  const amountsAll = await repo.amountsOf(ids);
  let budget = MAX_PER_CALL;
  let posted = 0;
  for (const sub of await repo.findManyByIds(ids)) {
    const amounts = amountsAll
      .filter((a) => a.subscriptionId === sub.id)
      .map((a) => ({
        fromMonth: fromDbDate(a.fromMonth).slice(0, 7) as MonthISO,
        amountInCents: toCents(a.amountInCents),
        createdAt: a.createdAt,
      }));
    const endMonth = sub.endMonth ? (fromDbDate(sub.endMonth).slice(0, 7) as MonthISO) : null;
    const done = await repo.chargeMonths(sub.id);
    let on = sub.nextChargeOn ? fromDbDate(sub.nextChargeOn) : null;
    while (on !== null && on <= today && budget > 0) {
      const month = monthOf(on) as MonthISO;
      if (!done.has(month)) {
        if (await chargeMonth(tx, ctx, repo, sub, month, on, amounts)) posted += 1;
        budget -= 1; // o teto de 12 conta também as puladas (cada uma é um registro gravado)
      }
      const next = nextAfter(month, sub.dayOfMonth, endMonth);
      on = next ? next.on : null;
      await repo.setNext(sub.id, on);
    }
    if (budget === 0) break;
  }
  return posted;
}

/**
 * Transação curta própria por assinatura vencida, ANTES da leitura. Falha de uma não quebra a leitura
 * nem as outras; o log não leva descrição, valor nem dados de pessoas.
 */
export async function ensureSubscriptionChargesStandalone(
  ctx: RequestContext,
  db: PrismaClient,
): Promise<void> {
  const today = todayInFamilyTz(ctx.clock);
  const due = await db.cardSubscription.findMany({
    where: {
      familyId: ctx.familyId,
      endedAt: null,
      nextChargeOn: { lte: new Date(`${today}T00:00:00Z`) },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const { id } of due) {
    try {
      await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctx, { subscriptionId: id }), {
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (e) {
      logger.error(
        {
          familyId: ctx.familyId,
          subscriptionId: id,
          err: e instanceof Error ? e.name : "unknown",
        },
        "falha ao lançar cobrança de assinatura",
      );
    }
  }
}
