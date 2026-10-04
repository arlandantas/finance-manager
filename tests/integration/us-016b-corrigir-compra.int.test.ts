import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoicePayment,
  makeTransaction,
} from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
let itau: AccountFixture;
let card: CardFixture;
let purchaseId: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  setDevClockOverride("2026-10-20T15:00:00Z");
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  card = await makeCard(fx, {
    name: "Nubank Mariana",
    owner: "Mariana",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
  purchaseId = (
    await makeCardPurchase(fx, {
      card,
      amountInCents: 30000,
      occurredOn: "2026-10-15",
      author: "Mariana",
      payer: "Mariana",
    })
  ).id;
});

const patch = (as: ReturnType<typeof mariana>, body: Record<string, unknown>, id = purchaseId) =>
  call(as, "PATCH", `/api/v1/transactions/${id}`, body);
const cards = async () => (await call(lucas(), "GET", "/api/v1/cards")).body.items[0];
const invoice = async (ref: string) =>
  (await call(lucas(), "GET", `/api/v1/cards/${card.id}/invoices/${ref}`)).body.invoice;

describe("US-016b Corrigir compra no cartão", () => {
  it("valor: 200, version 2, total da fatura e limite recalculados, revisão UPDATE, 'Editado por'", async () => {
    const res = await patch(mariana(), { version: 1, amountInCents: 25000 });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ version: 2, editedBy: { name: "Mariana Silva" } });
    expect(res.body.card).toMatchObject({ usedInCents: 25000, availableInCents: 475000 });
    expect(res.body.account).toBeUndefined();
    expect((await invoice("2026-10")).totalInCents).toBe(25000);
    expect((await cards()).availableInCents).toBe(475000);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: purchaseId, action: "UPDATE" },
    });
    expect(revs).toHaveLength(1);
  });

  it("data para depois do fechamento muda a fatura (nov/2026); out/2026 fica com 0", async () => {
    setDevClockOverride("2026-10-28T15:00:00Z");
    const res = await patch(mariana(), { version: 1, occurredOn: "2026-10-27" });
    expect(res.status).toBe(200);
    expect(res.body.transaction.invoice.ref).toBe("2026-11");
    expect((await invoice("2026-10")).totalInCents).toBe(0);
    expect((await invoice("2026-11")).totalInCents).toBe(30000);
    // e de volta (fatura de destino mais antiga: ordem crescente de locks)
    const back = await patch(mariana(), { version: 2, occurredOn: "2026-10-10" });
    expect(back.body.transaction.invoice.ref).toBe("2026-10");
  });

  it("dois PATCH cruzados entre as duas faturas terminam sem deadlock", async () => {
    setDevClockOverride("2026-10-28T15:00:00Z");
    const other = (
      await makeCardPurchase(fx, { card, amountInCents: 1000, occurredOn: "2026-10-27" })
    ).id;
    const [a, b] = await Promise.all([
      patch(mariana(), { version: 1, occurredOn: "2026-10-27" }),
      patch(lucas(), { version: 1, occurredOn: "2026-10-10" }, other),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it("excluir libera o limite, restaurar volta a consumi-lo; repetir => ALREADY_DELETED", async () => {
    const del = await call(mariana(), "POST", `/api/v1/transactions/${purchaseId}/delete`, {
      version: 1,
    });
    expect(del.status).toBe(200);
    expect((await cards()).availableInCents).toBe(500000);
    expect((await invoice("2026-10")).purchases).toHaveLength(0);
    expect(
      (await call(mariana(), "POST", `/api/v1/transactions/${purchaseId}/delete`, { version: 2 }))
        .body.error.code,
    ).toBe("ALREADY_DELETED");
    const res = await call(mariana(), "POST", `/api/v1/transactions/${purchaseId}/restore`, {
      version: 2,
    });
    expect(res.status).toBe(200);
    expect((await cards()).availableInCents).toBe(470000);
  });

  it("forma de pagamento não editável: accountId em compra de cartão => 422 PAYMENT_SOURCE_NOT_EDITABLE", async () => {
    const res = await patch(mariana(), { version: 1, accountId: itau.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("PAYMENT_SOURCE_NOT_EDITABLE");
    expect(res.body.error.message).toBe(
      "Para mudar a forma de pagamento, exclua e lance novamente",
    );
  });

  it("conflito: dois PATCH => 1x200 e 1x409", async () => {
    const [a, b] = await Promise.all([
      patch(mariana(), { version: 1, amountInCents: 1000 }),
      patch(lucas(), { version: 1, amountInCents: 2000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((r) => r.status === 409)?.body.error.message).toMatch(
      /Este lançamento foi alterado por .+\. Recarregue para continuar\./,
    );
  });

  it("data futura na compra => 'A data da compra não pode ser futura'", async () => {
    const res = await patch(mariana(), { version: 1, occurredOn: "2026-10-21" });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("A data da compra não pode ser futura");
  });

  it("mover para fatura paga => INVOICE_PAID_LOCKED", async () => {
    const other = await makeCardPurchase(fx, {
      card,
      amountInCents: 1000,
      occurredOn: "2026-09-10",
    });
    const inv = await db.cardInvoice.findFirstOrThrow({ where: { id: other.invoiceId as string } });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: inv.id, cardId: card.id, ref: "2026-09" },
      account: itau,
      amountInCents: 1000,
      paidOn: "2026-10-01",
    });
    const res = await patch(mariana(), { version: 1, occurredOn: "2026-09-12" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_PAID_LOCKED");
  });
});

describe("US-016b Filtro por cartão, detalhe e acerto", () => {
  it("?cardId= traz só a compra; ?accountId= não; totais do filtro corretos", async () => {
    await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 8000,
      occurredOn: "2026-10-12",
    });
    const byCard = (
      await call(lucas(), "GET", `/api/v1/transactions?period=2026-10&cardId=${card.id}`)
    ).body;
    expect(byCard.items).toHaveLength(1);
    expect(byCard.totals.expenseInCents).toBe(30000);
    const byAcc = (
      await call(lucas(), "GET", `/api/v1/transactions?period=2026-10&accountId=${itau.id}`)
    ).body;
    expect(byAcc.items.some((i: { card: unknown }) => i.card)).toBe(false);
    expect(byAcc.totals.expenseInCents).toBe(8000);
  });

  it("detalhe: card, invoice, author e payer", async () => {
    const res = await call(lucas(), "GET", `/api/v1/transactions/${purchaseId}`);
    expect(res.body.transaction).toMatchObject({
      card: { name: "Nubank Mariana" },
      invoice: { ref: "2026-10", dueDate: "2026-11-05" },
      author: { name: "Mariana Silva" },
      payer: { name: "Mariana Silva" },
    });
  });

  it("acerto recalculado ao excluir a compra compartilhada", async () => {
    const before = (await call(lucas(), "GET", "/api/v1/settlement")).body;
    expect(before.totalSharedInCents).toBe(30000);
    await call(mariana(), "POST", `/api/v1/transactions/${purchaseId}/delete`, { version: 1 });
    const after = (await call(lucas(), "GET", "/api/v1/settlement")).body;
    expect(after.totalSharedInCents).toBe(0);
    expect(after.suggestions).toHaveLength(0);
  });
});
