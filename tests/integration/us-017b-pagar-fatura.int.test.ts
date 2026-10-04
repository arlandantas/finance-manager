import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
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
const NOW = "2026-10-28T15:00:00Z"; // hoje = 28/10/2026 (out/2026 fechada em 25/10)
let fx: FamilyFixture;
let itau: AccountFixture;
let card: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const today = (d: string) => setDevClockOverride(`${d}T15:00:00Z`);

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  today("2026-10-28");
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
  await makeCardPurchase(fx, { card, amountInCents: 120000, occurredOn: "2026-10-10" });
});

const pay = (
  as: ReturnType<typeof lucas>,
  body: Record<string, unknown> = {},
  o: { ref?: string; key?: string } = {},
) =>
  call(
    as,
    "POST",
    `/api/v1/cards/${card.id}/invoices/${o.ref ?? "2026-10"}/pay`,
    { accountId: itau.id, expectedTotalInCents: 120000, ...body },
    o.key ? { idempotencyKey: o.key } : {},
  );
const undo = (as: ReturnType<typeof lucas>, version: number, ref = "2026-10") =>
  call(as, "POST", `/api/v1/cards/${card.id}/invoices/${ref}/undo-payment`, { version });
const balance = async () => (await accountBalances(db as never, fx.family.id)).get(itau.id);
const cards = () => call(lucas(), "GET", "/api/v1/cards");
const invoice = (ref = "2026-10") =>
  call(lucas(), "GET", `/api/v1/cards/${card.id}/invoices/${ref}`);

describe("US-017b Pagar a fatura fechada", () => {
  it("201: saldo 180000, fatura PAID em 28/10, INVOICE_PAYMENT DEBIT 120000 com a descrição", async () => {
    const res = await pay(lucas());
    expect(res.status).toBe(201);
    expect(res.body.account).toEqual({ id: itau.id, balanceInCents: 180000 });
    expect(res.body.invoice).toMatchObject({ status: "PAID", paidOn: "2026-10-28", canPay: false });
    expect(res.body.invoice.payment).toMatchObject({
      amountInCents: 120000,
      accountName: "Itaú Lucas",
      paidOn: "2026-10-28",
    });
    expect(res.body.payment).toMatchObject({
      type: "INVOICE_PAYMENT",
      direction: "DEBIT",
      amountInCents: 120000,
      description: "Pagamento da fatura Nubank Mariana - out/2026",
      account: { name: "Itaú Lucas" },
      card: { name: "Nubank Mariana" },
      category: null,
      payer: null,
    });
    expect(await balance()).toBe(180000);
    expect(res.body.card).toMatchObject({ usedInCents: 0, availableInCents: 500000 });
    const t = await db.transaction.findFirstOrThrow({ where: { kind: "INVOICE_PAYMENT" } });
    expect(t.isSharedExpense).toBe(false);
    expect(
      (await db.transactionRevision.findMany({ where: { transactionId: t.id } })).map(
        (r) => r.action,
      ),
    ).toEqual(["CREATE"]);
  });

  it("libera o limite exatamente no total da fatura", async () => {
    expect((await cards()).body.items[0].availableInCents).toBe(380000);
    await pay(lucas());
    expect((await cards()).body.items[0]).toMatchObject({
      usedInCents: 0,
      availableInCents: 500000,
    });
  });

  it("não é despesa: totais, Home e acerto idênticos; Σ saldos cai exatamente o total", async () => {
    const snapshot = async () => ({
      totals: (await call(lucas(), "GET", "/api/v1/transactions?period=2026-10")).body.totals
        .expenseInCents,
      home: (await call(lucas(), "GET", "/api/v1/home")).body.monthSummary,
      settlement: (await call(lucas(), "GET", "/api/v1/settlement")).body,
      sum: [...(await accountBalances(db as never, fx.family.id)).values()].reduce(
        (a, b) => a + b,
        0,
      ),
    });
    const before = await snapshot();
    await pay(lucas());
    const after = await snapshot();
    expect(after.totals).toBe(before.totals);
    expect(after.home).toEqual(before.home);
    expect(after.settlement).toEqual(before.settlement);
    expect(after.sum).toBe(before.sum - 120000);
  });

  it("extrato: linha neutra com conta e cartão, fora dos totais e dentro do count; filtro type=INVOICE_PAYMENT", async () => {
    const before = (await call(lucas(), "GET", "/api/v1/transactions?period=2026-10")).body;
    await pay(lucas());
    const res = (await call(lucas(), "GET", "/api/v1/transactions?period=2026-10")).body;
    const item = res.items.find((i: { type: string }) => i.type === "INVOICE_PAYMENT");
    expect(item).toMatchObject({
      account: { name: "Itaú Lucas" },
      card: { name: "Nubank Mariana" },
      invoice: { ref: "2026-10" },
    });
    expect(res.totals.expenseInCents).toBe(before.totals.expenseInCents);
    expect(res.totals.incomeInCents).toBe(before.totals.incomeInCents);
    expect(res.totals.count).toBe(before.totals.count + 1);
    const only = (
      await call(lucas(), "GET", "/api/v1/transactions?period=2026-10&type=INVOICE_PAYMENT")
    ).body;
    expect(only.items).toHaveLength(1);
    const byCard = (
      await call(lucas(), "GET", `/api/v1/transactions?period=2026-10&cardId=${card.id}`)
    ).body;
    expect(byCard.items).toHaveLength(2);
    const byAccount = (
      await call(lucas(), "GET", `/api/v1/transactions?period=2026-10&accountId=${itau.id}`)
    ).body;
    expect(byAccount.items.map((i: { type: string }) => i.type)).toContain("INVOICE_PAYMENT");
    expect(
      byAccount.items.some((i: { card: unknown; account: unknown }) => i.card && !i.account),
    ).toBe(false);
  });

  it("aberta => 422 INVOICE_NOT_CLOSED; total 0 => 422 INVOICE_EMPTY; ref futura => 404", async () => {
    await makeCardPurchase(fx, { card, amountInCents: 30000, occurredOn: "2026-10-27" }); // nov: aberta
    const open = await pay(lucas(), { expectedTotalInCents: 30000 }, { ref: "2026-11" });
    expect(open.status).toBe(422);
    expect(open.body.error.code).toBe("INVOICE_NOT_CLOSED");
    expect(open.body.error.message).toBe(
      "A fatura ainda está aberta e só pode ser paga depois do fechamento",
    );
    await makeInvoice(fx, card, "2026-09");
    const empty = await pay(lucas(), { expectedTotalInCents: 1 }, { ref: "2026-09" });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe("INVOICE_EMPTY");
    expect((await pay(lucas(), {}, { ref: "2027-03" })).status).toBe(404);
    expect((await invoice("2026-09")).body.invoice.canPay).toBe(false);
    expect((await invoice("2026-11")).body.invoice.canPay).toBe(false);
    // fatura aberta virtual (sem compras) também não é pagável
    today("2026-12-01");
    const virtual = await pay(lucas(), { expectedTotalInCents: 1 }, { ref: "2026-12" });
    expect(virtual.body.error.code).toBe("INVOICE_NOT_CLOSED");
  });
});

describe("US-017b Validações", () => {
  it("data futura => 422; = fechamento => PAYMENT_BEFORE_CLOSING; 26/10 => 201; conta de outra família => 422; sem conta => 400", async () => {
    const future = await pay(lucas(), { paidOn: "2026-10-29" });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    expect(future.body.error.message).toBe("A data do pagamento não pode ser futura");
    const before = await pay(lucas(), { paidOn: "2026-10-25" });
    expect(before.status).toBe(422);
    expect(before.body.error.code).toBe("PAYMENT_BEFORE_CLOSING");
    expect(before.body.error.message).toBe(
      "A data do pagamento deve ser posterior ao fechamento da fatura",
    );
    const other = await makeFamily({ uniqueEmails: true });
    const alien = await makeAccount(other, { name: "Alheia", openingBalanceInCents: 1 });
    expect((await pay(lucas(), { accountId: alien.id })).body.error.code).toBe("INVALID_REFERENCE");
    const none = await call(lucas(), "POST", `/api/v1/cards/${card.id}/invoices/2026-10/pay`, {
      expectedTotalInCents: 120000,
    });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toBe("Escolha a conta de pagamento");
    expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT" } })).toBe(0);
    expect((await pay(lucas(), { paidOn: "2026-10-26" })).status).toBe(201);
  });

  it("conta ficará negativa: 201 e saldo -70000", async () => {
    const poor = await makeAccount(fx, { name: "Pobre", openingBalanceInCents: 50000 });
    const res = await pay(lucas(), { accountId: poor.id });
    expect(res.status).toBe(201);
    expect(res.body.account.balanceInCents).toBe(-70000);
  });
});

describe("US-017b Concorrência", () => {
  it("duplo clique: mesma chave => 1 pagamento; chaves diferentes => 1x201 e 1x409 INVOICE_ALREADY_PAID", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([pay(lucas(), {}, { key }), pay(lucas(), {}, { key })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT" } })).toBe(1);
    expect(await balance()).toBe(180000);
    await undo(lucas(), 1);
    const [c, d] = await Promise.all([pay(lucas()), pay(mariana())]);
    expect([c.status, d.status].sort()).toEqual([201, 409]);
    expect((c.status === 409 ? c : d).body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(
      await db.transaction.count({ where: { kind: "INVOICE_PAYMENT", deletedAt: null } }),
    ).toBe(1);
  });

  it("fatura já paga => 409 'Esta fatura já foi paga'; nada debitado", async () => {
    await pay(lucas());
    const again = await pay(mariana());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(again.body.error.message).toBe("Esta fatura já foi paga");
    expect(await balance()).toBe(180000);
  });

  it("total mudou: 409 INVOICE_TOTAL_CHANGED com currentTotalInCents; nada debitado", async () => {
    const category = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const retro = await call(mariana(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      cardId: card.id,
      categoryId: category,
      amountInCents: 5000,
      occurredOn: "2026-10-20",
    });
    expect(retro.status).toBe(201);
    const res = await pay(lucas());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVOICE_TOTAL_CHANGED");
    expect(res.body.error.message).toBe("O valor da fatura mudou. Confira e tente de novo.");
    expect(res.body.error.details).toEqual({ currentTotalInCents: 125000 });
    expect(await balance()).toBe(300000);
    expect((await pay(lucas(), { expectedTotalInCents: 125000 })).status).toBe(201);
  });

  it("corrida compra x pagamento: nunca pagamento sem incluir a compra", async () => {
    const category = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const [purchase, payment] = await Promise.all([
      call(mariana(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        cardId: card.id,
        categoryId: category,
        amountInCents: 5000,
        occurredOn: "2026-10-20",
      }),
      pay(lucas()),
    ]);
    if (purchase.status === 201) {
      expect(payment.status).toBe(409); // a compra entrou antes: o total esperado mudou
      expect(payment.body.error.code).toBe("INVOICE_TOTAL_CHANGED");
    } else {
      expect(purchase.status).toBe(422); // o pagamento foi antes: fatura paga recusa a compra
      expect(purchase.body.error.code).toBe("INVOICE_ALREADY_PAID");
      expect(payment.status).toBe(201);
    }
    const paid = await db.transaction.findFirst({
      where: { kind: "INVOICE_PAYMENT", deletedAt: null },
    });
    if (paid) {
      const sum = await db.transaction.aggregate({
        where: { invoiceId: paid.invoiceId, kind: "EXPENSE", deletedAt: null },
        _sum: { amountInCents: true },
      });
      expect(paid.amountInCents).toBe(sum._sum.amountInCents);
    }
  });

  it("isolamento: pay/undo de outra família => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await pay(b)).status).toBe(404);
    expect((await undo(b, 1)).status).toBe(404);
  });
});

describe("US-017b Desfazer, travas e banco", () => {
  it("desfazer: saldo volta, fatura CLOSED, uso volta, perna UNDONE + revisão UNDO; repetir => 409; versão velha => 409; novo pagamento => 201", async () => {
    const paid = await pay(lucas());
    const version = paid.body.invoice.payment.version;
    const res = await undo(lucas(), version);
    expect(res.status).toBe(200);
    expect(res.body.account.balanceInCents).toBe(300000);
    expect(res.body.invoice).toMatchObject({ status: "CLOSED", payment: null, canPay: true });
    expect(res.body.card).toMatchObject({ usedInCents: 120000, availableInCents: 380000 });
    const t = await db.transaction.findFirstOrThrow({ where: { kind: "INVOICE_PAYMENT" } });
    expect(t).toMatchObject({ deletionReason: "UNDONE" });
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: t.id },
      orderBy: { revision: "asc" },
    });
    expect(revs.map((r) => r.action)).toEqual(["CREATE", "UNDO"]);
    const again = await undo(lucas(), version + 1);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVOICE_NOT_PAID");
    expect((await pay(lucas())).status).toBe(201);
    const stale = await undo(lucas(), 1); // a versão do novo pagamento é 1; a antiga já era 1
    expect(stale.status).toBe(200);
    const paid2 = await pay(lucas());
    const bad = await undo(lucas(), paid2.body.invoice.payment.version + 5);
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("compra em fatura paga é recusada com a mensagem exata e nada é gravado", async () => {
    await pay(lucas());
    const category = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const before = await db.transaction.count();
    const res = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      cardId: card.id,
      categoryId: category,
      amountInCents: 1000,
      occurredOn: "2026-10-20",
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(res.body.error.message).toBe(
      "A fatura de out/2026 já foi paga. Use uma data posterior ao fechamento.",
    );
    expect(res.body.error.details).toEqual({ ref: "2026-10" });
    expect(await db.transaction.count()).toBe(before);
  });

  it("compras de fatura paga ficam travadas (PATCH/delete/restore); depois de desfazer => 200", async () => {
    const purchase = await db.transaction.findFirstOrThrow({
      where: { kind: "EXPENSE", cardId: card.id },
    });
    const del = await call(lucas(), "POST", `/api/v1/transactions/${purchase.id}/delete`, {
      version: 1,
    });
    expect(del.status).toBe(200); // ainda não paga
    await call(lucas(), "POST", `/api/v1/transactions/${purchase.id}/restore`, { version: 2 });
    const paid = await pay(lucas());
    const locked =
      "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.";
    const patch = await call(lucas(), "PATCH", `/api/v1/transactions/${purchase.id}`, {
      version: 3,
      amountInCents: 100,
    });
    expect(patch.status).toBe(422);
    expect(patch.body.error.code).toBe("INVOICE_PAID_LOCKED");
    expect(patch.body.error.message).toBe(locked);
    expect(
      (await call(lucas(), "POST", `/api/v1/transactions/${purchase.id}/delete`, { version: 3 }))
        .body.error.code,
    ).toBe("INVOICE_PAID_LOCKED");
    await undo(lucas(), paid.body.invoice.payment.version);
    expect(
      (
        await call(lucas(), "PATCH", `/api/v1/transactions/${purchase.id}`, {
          version: 3,
          amountInCents: 100,
        })
      ).status,
    ).toBe(200);
  });

  it("restaurar compra excluída numa fatura que ficou paga depois => 422 INVOICE_PAID_LOCKED", async () => {
    const extra = await makeCardPurchase(fx, {
      card,
      amountInCents: 7000,
      occurredOn: "2026-10-12",
      deleted: true,
    });
    await pay(lucas());
    const res = await call(lucas(), "POST", `/api/v1/transactions/${extra.id}/restore`, {
      version: 1,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_PAID_LOCKED");
  });

  it("o pagamento não é editável nem excluível: 422 NOT_EDITABLE", async () => {
    const paid = await pay(lucas());
    const id = paid.body.payment.id;
    const patch = await call(lucas(), "PATCH", `/api/v1/transactions/${id}`, {
      version: 1,
      description: "xx",
    });
    expect(patch.status).toBe(422);
    expect(patch.body.error.code).toBe("NOT_EDITABLE");
    expect(
      (await call(lucas(), "POST", `/api/v1/transactions/${id}/delete`, { version: 1 })).body.error
        .code,
    ).toBe("NOT_EDITABLE");
    expect(
      (await call(lucas(), "POST", `/api/v1/transactions/${id}/restore`, { version: 1 })).body.error
        .code,
    ).toBe("NOT_EDITABLE");
  });

  it("banco: 2º pagamento ativo viola tx_invoice_payment_active_uq; sem conta/cartão viola o CHECK; DELETE direto é proibido", async () => {
    const inv = await db.cardInvoice.findFirstOrThrow({ where: { cardId: card.id } });
    const fixtureInv = { id: inv.id, cardId: card.id, ref: "2026-10" };
    await makeInvoicePayment(fx, {
      card,
      invoice: fixtureInv,
      account: itau,
      amountInCents: 120000,
      paidOn: "2026-10-28",
    });
    await expect(
      makeInvoicePayment(fx, {
        card,
        invoice: fixtureInv,
        account: itau,
        amountInCents: 120000,
        paidOn: "2026-10-28",
      }),
    ).rejects.toThrow(/tx_invoice_payment_active_uq/);
    await expect(
      db.transaction.create({
        data: {
          familyId: fx.family.id,
          kind: "INVOICE_PAYMENT",
          direction: "DEBIT",
          cardId: card.id,
          invoiceId: inv.id,
          amountInCents: 1n,
          occurredOn: new Date("2026-10-28T00:00:00Z"),
          description: "x",
          authorMemberId: fx.byName.Lucas?.memberId as string,
        },
      }),
    ).rejects.toThrow(/tx_kind_shape_chk/);
    await expect(
      db.$executeRawUnsafe(`DELETE FROM transactions WHERE kind = 'INVOICE_PAYMENT'`),
    ).rejects.toThrow(/append-only/);
  });

  it("atomicidade: falha ao gravar a revisão => o pagamento não persiste", async () => {
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    expect((await pay(lucas())).status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT" } })).toBe(0);
    expect(await balance()).toBe(300000);
  });
});
