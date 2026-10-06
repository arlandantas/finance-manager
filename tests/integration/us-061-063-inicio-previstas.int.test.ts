import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const home = () => withClock(NOW, () => call(lucas(), "GET", "/api/v1/home"));
const payables = () => withClock(NOW, () => call(lucas(), "GET", "/api/v1/payables"));
let n = 0;
const t = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++n));

beforeEach(async () => {
  await resetDb();
  n = 0;
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-063 Previstas e Despesas no Resumo do Mês", () => {
  it("Despesas = Previstas (faturas + em aberto + pagas) + Não previstas; Resultado segue o realizado", async () => {
    const card = await makeCard(fx, { name: "Nubank Roxinho", closingDay: 5, dueDay: 10 });
    await makeCardPurchase(fx, { card, amountInCents: 47900, occurredOn: "2026-09-20" }); // fatura 2026-10, vence 10/10 (atrasada)
    const card2 = await makeCard(fx, { name: "Inter", closingDay: 5, dueDay: 15 });
    await makeCardPurchase(fx, { card: card2, amountInCents: 20000, occurredOn: "2026-09-20" });
    const paidInv = await makeInvoice(fx, card2, "2026-10");
    await makeInvoicePayment(fx, {
      card: card2,
      invoice: paidInv,
      account: itau,
      amountInCents: 20000,
      paidOn: "2026-10-08",
    }); // fatura paga, vence 15/10
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-10-20",
    });
    const paidTx = await makeTransaction(fx, {
      account: itau,
      category: "Moradia",
      amountInCents: 30000,
      occurredOn: "2026-10-04",
      createdAt: t(),
    });
    await makePlannedExpense(fx, {
      description: "Luz",
      amountInCents: 28000,
      dueOn: "2026-10-05",
      paidTransactionId: paidTx.id,
    });
    await makeTransaction(fx, {
      account: itau,
      category: "Moradia",
      amountInCents: 40000,
      occurredOn: "2026-10-03",
      createdAt: t(),
    });
    const s = (await home()).body.monthSummary;
    expect(s.planned).toEqual({
      invoicesInCents: 47900 + 20000,
      openInCents: 65000,
      paidInCents: 30000,
      totalInCents: 47900 + 20000 + 65000 + 30000,
      openToPayInCents: 47900 + 65000,
    });
    expect(s.unplannedInCents).toBe(40000);
    expect(s.projectedExpenseInCents).toBe(s.planned.totalInCents + 40000);
    expect(s.expenseInCents).toBe(70000); // realizado: Luz paga + 400 (compras no cartão pela fatura)
    expect(s.resultInCents).toBe(s.incomeInCents - 70000);
    // "A pagar em aberto" reconcilia com a tela A pagar
    expect(s.planned.openToPayInCents).toBe((await payables()).body.totals.dueInCents);
  });
});

describe("US-061 Início enxuta", () => {
  it("dueSoon: janela de 7 dias com prevista e fatura, fora da janela não entra; subconjunto do A pagar", async () => {
    const card = await makeCard(fx, { name: "Nubank", closingDay: 5, dueDay: 17 });
    await makeCardPurchase(fx, { card, amountInCents: 47900, occurredOn: "2026-09-20" }); // vence 17/10
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-10-15",
    });
    await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 90000,
      dueOn: "2026-10-31",
    });
    const h = (await home()).body;
    expect(h.dueSoon.items.map((i: { title: string }) => i.title)).toEqual([
      "Condomínio",
      "Fatura Nubank",
    ]);
    expect(h.dueSoon.totalCount).toBe(2);
    const all = (await payables()).body.items as Array<{ id: string; amountInCents: number }>;
    for (const i of h.dueSoon.items) {
      expect(all.find((a) => a.id === i.id)?.amountInCents).toBe(i.amountInCents);
    }
  });

  it("vazio: nada a vencer; extrato recente limitado a 10", async () => {
    for (let i = 0; i < 25; i++) {
      await makeTransaction(fx, {
        account: itau,
        category: "Moradia",
        amountInCents: 1000 + i,
        occurredOn: "2026-10-02",
        createdAt: t(),
      });
    }
    const h = (await home()).body;
    expect(h.dueSoon).toEqual({ items: [], overdue: { count: 0, totalInCents: 0 }, totalCount: 0 });
    expect(h.recent).toHaveLength(10);
  });
});
