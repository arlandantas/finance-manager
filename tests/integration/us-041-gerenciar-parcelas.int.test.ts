import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeInvoicePayment,
  makeTransfer,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z"; // fatura aberta = nov (fechamento dia 25)
let fx: FamilyFixture;
let itau: AccountFixture;
let nubank: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  nubank = await makeCard(fx, {
    name: "Nubank",
    owner: "Mariana",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
});

async function buy(o: { total?: number; count?: number; author?: string } = {}) {
  const bought = await makeInstallmentPurchase(fx, {
    card: nubank,
    total: o.total ?? 250000,
    count: o.count ?? 10,
    purchaseOn: "2026-11-10",
    description: "Notebook",
    author: o.author ?? "Lucas",
  });
  setDevClockOverride(NOW);
  return bought;
}
const parcelIds = (b: Awaited<ReturnType<typeof buy>>) =>
  b.plan.installments.map((p) => p.transactionId);
const planOf = (id: string) => db.installmentPlan.findFirstOrThrow({ where: { id } });
const rowOf = (id: string) => db.transaction.findFirstOrThrow({ where: { id } });
const patch = (id: string, body: Record<string, unknown>, as = lucas()) =>
  call(as, "PATCH", `/api/v1/transactions/${id}`, body);
const post = (id: string, action: "delete" | "restore", body: Record<string, unknown>) =>
  call(lucas(), "POST", `/api/v1/transactions/${id}/${action}`, body);
async function edit(
  b: Awaited<ReturnType<typeof buy>>,
  no: number,
  body: Record<string, unknown>,
  as = lucas(),
) {
  const id = parcelIds(b)[no - 1] as string;
  return patch(
    id,
    {
      version: (await rowOf(id)).version,
      planVersion: (await planOf(b.plan.id)).version,
      scope: "ONLY_THIS",
      ...body,
    },
    as,
  );
}
const cents = async (b: Awaited<ReturnType<typeof buy>>) =>
  (await db.transaction.findMany({ where: { installmentPlanId: b.plan.id } }))
    .sort((a, c) => (a.installmentNo ?? 0) - (c.installmentNo ?? 0))
    .map((r) => Number(r.amountInCents));
async function payNov(b: Awaited<ReturnType<typeof buy>>) {
  const first = await db.transaction.findFirstOrThrow({
    where: { installmentPlanId: b.plan.id, installmentNo: 1 },
  });
  await makeInvoicePayment(fx, {
    card: nubank,
    invoice: { id: first.invoiceId as string, cardId: nubank.id, ref: "2026-11" },
    account: itau,
    amountInCents: 25000,
    paidOn: "2026-11-10",
  });
}

describe("US-041: editar parcela", () => {
  it("AC2: somente a 3/10 para R$ 300,00 muda só ela e o limite cai R$ 50,00", async () => {
    const b = await buy();
    const res = await edit(b, 3, { amountInCents: 30000 });
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].amountInCents).toBe(30000);
    expect(res.body.card.usedInCents).toBe(250000 + 5000);
    expect(res.body.card.availableInCents).toBe(500000 - 255000);
    expect(await cents(b)).toEqual([25000, 25000, 30000, ...Array(7).fill(25000)]);
    expect((await planOf(b.plan.id)).version).toBe(2);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: parcelIds(b)[2] as string },
    });
    expect(revs.map((r) => r.action).sort()).toEqual(["CREATE", "UPDATE"]);
  });

  it("AC3: esta e as próximas a R$ 200,00; categoria idem", async () => {
    const b = await buy();
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia", kind: "EXPENSE" },
    });
    const res = await edit(b, 3, {
      scope: "THIS_AND_NEXT",
      amountInCents: 20000,
      categoryId: cat.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(8);
    expect(await cents(b)).toEqual([25000, 25000, ...Array(8).fill(20000)]);
    const cats = await db.transaction.findMany({ where: { installmentPlanId: b.plan.id } });
    expect(cats.filter((r) => r.categoryId === cat.id)).toHaveLength(8);
  });

  it("AC4/5: fatura paga trava; esta e as próximas pula a travada", async () => {
    const b = await buy();
    await payNov(b);
    const only = await edit(b, 1, { amountInCents: 1000 });
    expect(only.status).toBe(422);
    expect(only.body.error.code).toBe("INSTALLMENT_LOCKED");
    const res = await edit(b, 2, { scope: "THIS_AND_NEXT", amountInCents: 20000 });
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(9);
    expect(await cents(b)).toEqual([25000, ...Array(9).fill(20000)]);
    expect((await edit(b, 1, { description: "Outra", scope: "THIS_AND_NEXT" })).status).toBe(422);
  });

  it("AC4: fatura fechada e não paga também trava", async () => {
    const b = await buy();
    setDevClockOverride("2026-11-28T15:00:00Z");
    const res = await edit(b, 1, { amountInCents: 1000 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSTALLMENT_LOCKED");
    const plan = await call(lucas(), "GET", `/api/v1/installment-plans/${b.plan.id}`);
    expect(plan.body.plan.installments[0].lockedReason).toBe("INVOICE_CLOSED");
  });

  it("AC7: versão velha (parcela ou plano) => 409 com o nome de quem alterou", async () => {
    const b = await buy();
    expect((await edit(b, 2, { description: "Novo nome" }, mariana())).status).toBe(200);
    const id = parcelIds(b)[3] as string;
    const stale = await patch(id, {
      version: 1,
      planVersion: 1,
      scope: "ONLY_THIS",
      note: "x",
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.message).toBe(
      "Esta compra foi alterada por Mariana. Recarregue para continuar.",
    );
    const hist = await call(lucas(), "GET", `/api/v1/transactions/${parcelIds(b)[1]}/history`);
    expect(hist.body.items[0].actor.name).toContain("Mariana");
  });

  it("AC8: duplo envio com a mesma chave aplica uma vez", async () => {
    const b = await buy();
    const id = parcelIds(b)[2] as string;
    const body = { version: 1, planVersion: 1, scope: "ONLY_THIS", amountInCents: 30000 };
    const key = randomUUID();
    const send = () =>
      call(lucas(), "PATCH", `/api/v1/transactions/${id}`, body, { idempotencyKey: key });
    const [a, c] = await Promise.all([send(), send()]);
    expect(a.status).toBe(200);
    expect(c.status).toBe(200);
    const updates = await db.transactionRevision.count({
      where: { transactionId: id, action: "UPDATE" },
    });
    expect(updates).toBe(1);
  });

  it("AC9: parcela comum em mês acertado exige confirmação", async () => {
    const b = await buy();
    const id = parcelIds(b)[0] as string;
    await db.$executeRaw`UPDATE transactions SET "isSharedExpense" = true WHERE id = ${id}::uuid`;
    const other = await makeAccount(fx, { name: "Outra", owner: "Mariana" });
    await makeTransfer(fx, {
      from: itau,
      to: other,
      amountInCents: 100,
      occurredOn: "2026-11-05",
      kind: "SETTLEMENT",
    });
    const denied = await edit(b, 1, { amountInCents: 30000 });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
    const ok = await edit(b, 1, { amountInCents: 30000, confirmSettledPeriod: true });
    expect(ok.status).toBe(200);
  });

  it("sem diferença: 200 sem versão nova; escopo ausente em campo financeiro => 400", async () => {
    const b = await buy();
    const same = await edit(b, 2, { amountInCents: 25000 });
    expect(same.status).toBe(200);
    expect(same.body.transactions).toEqual([]);
    expect((await planOf(b.plan.id)).version).toBe(1);
    const id = parcelIds(b)[1] as string;
    const bad = await patch(id, { version: 1, amountInCents: 1000 });
    expect(bad.status).toBe(400);
  });

  it("outra família não enxerga a parcela (404)", async () => {
    const b = await buy();
    const other = await makeFamily({ uniqueEmails: true });
    const res = await edit(b, 1, { note: "x" }, other.byName.Mariana?.as ?? null);
    expect(res.status).toBe(404);
  });
});

describe("US-041: excluir e restaurar uma parcela", () => {
  it("AC6: excluir a 5/10 libera R$ 250,00, activeCount 9 e restaurar devolve", async () => {
    const b = await buy();
    const id = parcelIds(b)[4] as string;
    const del = await post(id, "delete", { version: 1 });
    expect(del.status).toBe(200);
    expect(del.body.card.usedInCents).toBe(225000);
    expect(del.body.plan.activeCount).toBe(9);
    const mar = await call(lucas(), "GET", `/api/v1/cards/${nubank.id}/invoices/2027-03`);
    expect(JSON.stringify(mar.body)).not.toContain("Notebook");
    const plan = await call(lucas(), "GET", `/api/v1/installment-plans/${b.plan.id}`);
    expect(plan.body.plan.installments[4].state).toBe("REMOVED");
    const again = await post(id, "delete", { version: 2 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_DELETED");
    const back = await post(id, "restore", { version: 2 });
    expect(back.status).toBe(200);
    expect(back.body.card.usedInCents).toBe(250000);
    expect(back.body.plan.activeCount).toBe(10);
  });

  it("parcela em fatura paga ou fechada não exclui (INSTALLMENT_LOCKED)", async () => {
    const b = await buy();
    await payNov(b);
    const paid = await post(parcelIds(b)[0] as string, "delete", { version: 1 });
    expect(paid.status).toBe(422);
    expect(paid.body.error.code).toBe("INSTALLMENT_LOCKED");
    setDevClockOverride("2026-11-28T15:00:00Z");
    const closed = await post(parcelIds(b)[0] as string, "delete", { version: 1 });
    expect(closed.body.error.code).toBe("INSTALLMENT_LOCKED");
  });

  it("restaurar em fatura que ganhou pagamento => INVOICE_PAID_LOCKED", async () => {
    const b = await buy();
    const first = parcelIds(b)[0] as string;
    expect((await post(first, "delete", { version: 1 })).status).toBe(200);
    await payNov(b);
    const res = await post(first, "restore", { version: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_PAID_LOCKED");
  });

  it("o plano inteiro excluído e restaurado não ressuscita a parcela excluída antes", async () => {
    const b = await buy();
    setDevClockOverride("2026-11-09T15:00:00Z"); // carimbos diferentes (o relógio de teste é fixo)
    expect((await post(parcelIds(b)[4] as string, "delete", { version: 1 })).status).toBe(200);
    setDevClockOverride(NOW);
    const plan = await planOf(b.plan.id);
    const del = await call(lucas(), "POST", `/api/v1/installment-plans/${b.plan.id}/delete`, {
      version: plan.version,
    });
    expect(del.status).toBe(200);
    const res = await call(lucas(), "POST", `/api/v1/installment-plans/${b.plan.id}/restore`, {
      version: del.body.plan.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.plan.activeCount).toBe(9);
  });
});
