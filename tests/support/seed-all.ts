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
}
