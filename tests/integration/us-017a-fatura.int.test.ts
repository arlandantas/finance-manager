import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { listPayableInvoices } from "@/modules/cartoes/invoice-service";
import { cardUsage, invoiceTotals } from "@/modules/cartoes/queries";
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
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
let card: CardFixture;
let itau: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

const today = (date: string) => setDevClockOverride(`${date}T15:00:00Z`);
const invoice = (ref: string) => call(lucas(), "GET", `/api/v1/cards/${card.id}/invoices/${ref}`);
const cards = () => call(lucas(), "GET", "/api/v1/cards");

beforeEach(async () => {
  await resetDb();
  today("2026-10-20");
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", openingBalanceInCents: 300000 });
  card = await makeCard(fx, {
    name: "Nubank Mariana",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
});

const purchase = (amountInCents: number, occurredOn: string, o: Record<string, unknown> = {}) =>
  makeCardPurchase(fx, { card, amountInCents, occurredOn, ...o });

describe("US-017a Fatura aberta com total e datas", () => {
  it("GET invoices/2026-10: OPEN, total 40000, datas e compras da mais recente para a mais antiga", async () => {
    await purchase(30000, "2026-10-15", { description: "Mercado" });
    await purchase(10000, "2026-10-17", { description: "Farmácia" });
    const res = await invoice("2026-10");
    expect(res.status).toBe(200);
    expect(res.body.invoice).toMatchObject({
      cardId: card.id,
      ref: "2026-10",
      status: "OPEN",
      isOverdue: false,
      totalInCents: 40000,
      purchasesCount: 2,
      closingDate: "2026-10-25",
      dueDate: "2026-11-05",
      paidOn: null,
      canPay: false,
      payment: null,
    });
    expect(res.body.invoice.purchases.map((p: { description: string }) => p.description)).toEqual([
      "Farmácia",
      "Mercado",
    ]);
  });

  it("GET /cards lista fatura aberta, usado e disponível", async () => {
    await purchase(40000, "2026-10-15");
    const res = await cards();
    expect(res.body.items[0]).toMatchObject({
      usedInCents: 40000,
      availableInCents: 460000,
      openInvoice: { ref: "2026-10", totalInCents: 40000 },
    });
  });
});

describe("US-017a Situação da fatura pelo relógio de São Paulo", () => {
  it("25/10 OPEN; 26/10 CLOSED, canPay e em payableInvoices; 06/11 vencida", async () => {
    await purchase(40000, "2026-10-15");
    today("2026-10-25");
    expect((await invoice("2026-10")).body.invoice.status).toBe("OPEN");
    today("2026-10-26");
    const closed = (await invoice("2026-10")).body.invoice;
    expect(closed).toMatchObject({ status: "CLOSED", isOverdue: false, canPay: true });
    const list = await cards();
    expect(list.body.items[0].payableInvoices).toHaveLength(1);
    expect(list.body.items[0].payableInvoices[0]).toMatchObject({
      ref: "2026-10",
      totalInCents: 40000,
    });
    expect(list.body.items[0].openInvoice.ref).toBe("2026-11");
    today("2026-11-05");
    expect((await invoice("2026-10")).body.invoice.isOverdue).toBe(false);
    today("2026-11-06");
    expect((await invoice("2026-10")).body.invoice).toMatchObject({
      status: "CLOSED",
      isOverdue: true,
    });
  });
});

describe("US-017a Limite, navegação e subtotais", () => {
  it("limite considera abertas e fechadas; fatura paga não conta", async () => {
    today("2026-10-28");
    await purchase(120000, "2026-10-10");
    await purchase(30000, "2026-10-27");
    const res = await cards();
    expect(res.body.items[0]).toMatchObject({ usedInCents: 150000, availableInCents: 350000 });
    const inv = await db.cardInvoice.findFirstOrThrow({
      where: { cardId: card.id, referenceMonth: "2026-10" },
    });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: inv.id, cardId: card.id, ref: "2026-10" },
      account: itau,
      amountInCents: 120000,
      paidOn: "2026-10-28",
    });
    const after = await cards();
    expect(after.body.items[0]).toMatchObject({ usedInCents: 30000, availableInCents: 470000 });
    expect((await invoice("2026-10")).body.invoice).toMatchObject({
      status: "PAID",
      paidOn: "2026-10-28",
    });
  });

  it("previousRef/nextRef coerentes; ref posterior à aberta => 404; ref inválida => 400", async () => {
    today("2026-11-28");
    await purchase(1000, "2026-10-10");
    await purchase(2000, "2026-11-10");
    const nov = (await invoice("2026-11")).body.invoice;
    expect(nov).toMatchObject({ previousRef: "2026-10", nextRef: "2026-12" });
    const out = (await invoice("2026-10")).body.invoice;
    expect(out).toMatchObject({ previousRef: null, nextRef: "2026-11" });
    // 28/11 já fechou nov (dia 25): a aberta é dez/2026 (virtual)
    const dez = (await invoice("2026-12")).body.invoice;
    expect(dez).toMatchObject({
      totalInCents: 0,
      purchasesCount: 0,
      previousRef: "2026-11",
      nextRef: null,
    });
    expect((await invoice("2027-01")).status).toBe(404);
    expect((await invoice("2026-13")).status).toBe(400);
    expect((await invoice("2026-09")).status).toBe(404);
  });

  it("subtotal por membro: Mariana 30000, Lucas 10000; membro sem compras = 0", async () => {
    await purchase(30000, "2026-10-10", { author: "Mariana", payer: "Mariana" });
    await purchase(10000, "2026-10-11", { author: "Lucas", payer: "Lucas" });
    const by = (await invoice("2026-10")).body.invoice.byMember;
    expect(
      by.find((m: { member: { id: string } }) => m.member.id === mid("Mariana")),
    ).toMatchObject({
      totalInCents: 30000,
      count: 1,
    });
    expect(by.find((m: { member: { id: string } }) => m.member.id === mid("Lucas"))).toMatchObject({
      totalInCents: 10000,
    });
    const alone = await makeFamily({
      uniqueEmails: true,
      members: [
        { email: "a@exemplo.com", name: "Ana Souza", role: "ADMIN" },
        { email: "b@exemplo.com", name: "Beto Souza", role: "MEMBER" },
      ],
    });
    const c2 = await makeCard(alone, { name: "Visa", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(alone, {
      card: c2,
      amountInCents: 500,
      occurredOn: "2026-10-10",
      author: "Ana",
      payer: "Ana",
    });
    const res = await call(
      alone.members[0]?.as ?? null,
      "GET",
      `/api/v1/cards/${c2.id}/invoices/2026-10`,
    );
    expect(res.body.invoice.byMember).toHaveLength(2);
    expect(
      res.body.invoice.byMember.find((m: { member: { name: string } }) =>
        m.member.name.startsWith("Beto"),
      ),
    ).toMatchObject({ totalInCents: 0, count: 0 });
  });

  it("compra retroativa em fatura fechada (não paga) aumenta o total; excluída não conta", async () => {
    today("2026-10-28");
    await purchase(40000, "2026-10-15");
    await purchase(10000, "2026-10-16", { deleted: true });
    const res = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      cardId: card.id,
      categoryId: (
        await db.category.findFirstOrThrow({
          where: { familyId: fx.family.id, name: "Supermercado" },
        })
      ).id,
      amountInCents: 5000,
      occurredOn: "2026-10-20",
    });
    expect(res.status).toBe(201);
    const inv = (await invoice("2026-10")).body.invoice;
    expect(inv).toMatchObject({ totalInCents: 45000, purchasesCount: 2, status: "CLOSED" });
    expect(inv.purchases).toHaveLength(2);
  });

  it("fatura sem compras: aberta virtual com total 0 e sem compras", async () => {
    const res = await cards();
    expect(res.body.items[0].openInvoice).toMatchObject({ totalInCents: 0, purchasesCount: 0 });
    const inv = (await invoice("2026-10")).body.invoice;
    expect(inv).toMatchObject({ totalInCents: 0, purchases: [], canPay: false, status: "OPEN" });
    expect(await db.cardInvoice.count()).toBe(0);
  });

  it("GET /cards/:id/invoices: materializadas + aberta, mais recentes primeiro", async () => {
    today("2026-11-28");
    await purchase(1000, "2026-10-10");
    const res = await call(lucas(), "GET", `/api/v1/cards/${card.id}/invoices`);
    expect(res.body.items.map((i: { ref: string }) => i.ref)).toEqual(["2026-12", "2026-10"]);
  });
});

describe("US-017a Agregação, isolamento e derivação", () => {
  it("listPayableInvoices: só CLOSED, total > 0 e não paga", async () => {
    today("2026-11-10");
    await purchase(40000, "2026-10-10"); // out: fechada, a pagar
    await purchase(5000, "2026-11-10"); // nov: aberta
    await purchase(7000, "2026-09-10"); // set: fechada e paga
    const setInv = await db.cardInvoice.findFirstOrThrow({
      where: { cardId: card.id, referenceMonth: "2026-09" },
    });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: setInv.id, cardId: card.id, ref: "2026-09" },
      account: itau,
      amountInCents: 7000,
      paidOn: "2026-10-01",
    });
    await makeInvoice(fx, card, "2026-08"); // vazia
    const ctx = {
      familyId: fx.family.id,
      memberId: mid("Lucas"),
      clock: { now: () => new Date("2026-11-10T15:00:00Z") },
    };
    const items = await listPayableInvoices(db as never, ctx as never);
    expect(items).toEqual([
      {
        cardId: card.id,
        cardName: "Nubank Mariana",
        ref: "2026-10",
        dueDate: "2026-11-05",
        totalInCents: 40000,
        isOverdue: true,
      },
    ]);
  });

  it("isolamento: fatura/lista de cartão de outra família => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await call(b, "GET", `/api/v1/cards/${card.id}/invoices/2026-10`)).status).toBe(404);
    expect((await call(b, "GET", `/api/v1/cards/${card.id}/invoices`)).status).toBe(404);
  });

  it("derivação: cardUsage = soma manual das compras ativas em faturas sem pagamento (dados aleatórios)", async () => {
    today("2026-12-30");
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const refs = new Set<string>();
    let expected = 0;
    const paid = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const month = 1 + rnd(11);
      const day = 1 + rnd(28);
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = 100 + rnd(50000);
      const deleted = rnd(5) === 0;
      const tx = await purchase(amount, date, { deleted });
      const inv = await db.cardInvoice.findUniqueOrThrow({ where: { id: tx.invoiceId as string } });
      refs.add(inv.referenceMonth);
      if (!deleted) expected += amount;
    }
    // paga duas faturas e ajusta o esperado
    for (const ref of [...refs].slice(0, 2)) {
      const inv = await db.cardInvoice.findFirstOrThrow({
        where: { cardId: card.id, referenceMonth: ref },
      });
      const total =
        (await invoiceTotals(db as never, fx.family.id, [inv.id])).get(inv.id)?.totalInCents ?? 0;
      await makeInvoicePayment(fx, {
        card,
        invoice: { id: inv.id, cardId: card.id, ref },
        account: itau,
        amountInCents: Math.max(total, 1),
        paidOn: "2026-12-29",
      });
      paid.add(ref);
      expected -= total;
    }
    const usage = await cardUsage(db as never, fx.family.id, [card.id]);
    expect(usage.get(card.id)).toBe(expected);
    const res = await cards();
    expect(res.body.items[0].usedInCents).toBe(expected);
  });
});
