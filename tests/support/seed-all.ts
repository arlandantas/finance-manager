import { testDb } from "./db";
import {
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeInvitation,
  makePlannedExpense,
  makeTransaction,
  makeTransfer,
} from "./factories";

/**
 * Semeia ao menos UMA linha em cada tabela com `familyId` (o teste confere pelo `information_schema`), para o
 * reteste de exclusão da família não passar "por falta de dado". Usa o mínimo de fábricas e SQL direto.
 */
export async function seedEverything(fx: FamilyFixture): Promise<void> {
  const db = testDb();
  const first = fx.members[0];
  if (!first) throw new Error("família sem membros");
  const mariana = first.memberId; // o primeiro membro (Administrador) é o dono dos dados semeados
  const who = first.name.split(" ")[0] as string;
  const familyId = fx.family.id;
  const itau = await makeAccount(fx, {
    name: "Itaú",
    owner: who,
    openingBalanceInCents: 100000,
  });
  const nub = await makeAccount(fx, {
    name: "Nubank",
    owner: who,
    openingBalanceInCents: 50000,
  });
  await makeTransaction(fx, {
    account: itau,
    category: "Supermercado",
    amountInCents: 12345,
    occurredOn: "2026-10-10",
    author: who,
    payer: who,
    shared: true,
    description: "Mercado do mês",
    tags: ["viagem"], // US-045: tags e transaction_tags também têm dado
  });
  await makeTransfer(fx, { from: itau, to: nub, amountInCents: 1000, occurredOn: "2026-10-11" });
  const card = await makeCard(fx, { name: "Visa", owner: who, paymentAccount: itau }); // US-089: FK cartão -> conta na exclusão da família
  await makeCardPurchase(fx, {
    card,
    amountInCents: 9900,
    occurredOn: "2026-10-12",
    author: who,
    payer: who,
  });
  await makePlannedExpense(fx, {
    description: "Internet",
    amountInCents: 9990,
    dueOn: "2026-11-10",
    responsible: who,
  });
  // US-100: transferência prevista (exclusão da família precisa apagá-la antes das contas)
  await db.plannedTransfer.create({
    data: {
      familyId,
      fromAccountId: itau.id,
      toAccountId: nub.id,
      amountInCents: 5000n,
      dueOn: new Date("2026-11-20T00:00:00Z"),
      authorMemberId: mariana,
    },
  });
  // US-101: série de transferência com uma ocorrência (a exclusão da família apaga ocorrência, série e contas)
  const series = await db.recurringTransfer.create({
    data: {
      familyId,
      fromAccountId: itau.id,
      toAccountId: nub.id,
      amountInCents: 7000n,
      dayOfMonth: 15,
      startMonth: new Date("2026-11-01T00:00:00Z"),
      authorMemberId: mariana,
    },
  });
  await db.plannedTransfer.create({
    data: {
      familyId,
      fromAccountId: itau.id,
      toAccountId: nub.id,
      amountInCents: 7000n,
      dueOn: new Date("2026-11-15T00:00:00Z"),
      seriesId: series.id,
      occurrenceMonth: new Date("2026-11-01T00:00:00Z"),
      authorMemberId: mariana,
    },
  });
  const category = await db.category.findFirstOrThrow({ where: { familyId, name: "Moradia" } });
  const recurring = await db.recurringExpense.create({
    data: {
      familyId,
      description: "Aluguel",
      amountInCents: 150000n,
      categoryId: category.id,
      responsibleMemberId: mariana,
      isSharedExpense: true,
      dayOfMonth: 5,
      startMonth: new Date("2026-10-01T00:00:00Z"),
      authorMemberId: mariana,
    },
  });
  // US-096: assinatura com valor e cobrança pulada (cobre as três tabelas novas na exclusão da família)
  const subscription = await db.cardSubscription.create({
    data: {
      familyId,
      cardId: card.id,
      description: "Netflix",
      categoryId: category.id,
      payerMemberId: mariana,
      dayOfMonth: 10,
      firstChargeOn: new Date("2026-11-10T00:00:00Z"),
      nextChargeOn: new Date("2026-12-10T00:00:00Z"),
      authorMemberId: mariana,
    },
  });
  await db.cardSubscriptionAmount.create({
    data: {
      familyId,
      subscriptionId: subscription.id,
      fromMonth: new Date("2026-11-01T00:00:00Z"),
      amountInCents: 3990n,
      authorMemberId: mariana,
    },
  });
  await db.subscriptionCharge.create({
    data: {
      familyId,
      subscriptionId: subscription.id,
      chargeMonth: new Date("2026-11-01T00:00:00Z"),
      chargeOn: new Date("2026-11-10T00:00:00Z"),
      status: "SKIPPED_INVOICE_PAID",
    },
  });
  await db.installmentPlan.create({
    data: {
      familyId,
      cardId: card.id,
      totalInCents: 30000n,
      installmentCount: 3,
      purchaseOn: new Date("2026-10-01T00:00:00Z"),
      description: "Geladeira",
      categoryId: category.id,
      payerMemberId: mariana,
      authorMemberId: mariana,
    },
  });
  await db.splitMigrationSnapshot.create({
    data: { familyId, periodKey: "2026-10", payload: { x: 1 } },
  });
  await db.dataMigration.create({ data: { name: "teste", familyId, state: "DONE" } });
  await db.familyEvent.create({
    data: { familyId, type: "FAMILY_RENAMED", actorMemberId: mariana, changes: { name: "x" } },
  });
  await makeInvitation(fx, {
    email: "vovo@exemplo.com",
    status: "PENDING",
    expiresAt: new Date("2027-01-01"),
  });
  await db.aiConsentEvent.create({
    data: {
      familyId,
      purpose: "SPENDING_ANALYSIS",
      action: "ENABLED",
      textVersion: 1,
      memberId: mariana,
    },
  });
  await db.memberAssistantLimits.create({ data: { familyId, memberId: mariana, maxTxPerDay: 3 } });
  const analysis = await db.spendingAnalysis.create({
    data: {
      familyId,
      periodKey: "2026-10",
      partial: false,
      requestedByMemberId: mariana,
      model: "fake",
      promptVersion: 1,
      payload: { total: 1 },
      result: {},
      refMap: {},
    },
  });
  await db.llmUsageEvent.create({
    data: {
      familyId,
      month: "2026-10",
      purpose: "SPENDING_ANALYSIS",
      memberId: mariana,
      model: "fake",
      status: "RESERVED",
      reservedMicroBrl: 1n,
      expiresAt: new Date("2027-01-01"),
      analysisId: analysis.id,
    },
  });
  await db.llmBudgetMonth.create({ data: { familyId, month: "2026-10", spentMicroBrl: 5n } });
  await db.avoidableDismissal.create({
    data: {
      familyId,
      kind: "RECURRING",
      categoryId: category.id,
      recurringExpenseId: recurring.id,
      displayName: "Aluguel",
      byMemberId: mariana,
    },
  });
  await db.categorySuggestionDismissal.create({
    data: { familyId, descriptionKey: "mercado", toCategoryId: category.id, byMemberId: mariana },
  });
  await db.settlementReviewDismissal.create({
    data: { familyId, periodKey: "2026-09", byMemberId: mariana },
  });
}
