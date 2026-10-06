import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import {
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
  makePlannedExpense,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const payables = (period?: string) =>
  withClock(NOW, () =>
    call(lucas(), "GET", `/api/v1/payables${period ? `?period=${period}` : ""}`),
  );
const summary = (period?: string) =>
  withClock(NOW, () =>
    call(lucas(), "GET", `/api/v1/month-summary${period ? `?period=${period}` : ""}`),
  );

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

describe("US-055 faturas em A pagar (fonte única)", () => {
  it("fatura aberta e fechada entram com selo; paga e zerada saem; grupos separados", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-10-20",
    });
    const card = await makeCard(fx, { name: "Nubank Roxinho", closingDay: 5, dueDay: 20 });
    // setembro: fechada (fecha 05/10), vence 20/10
    await makeCardPurchase(fx, { card, amountInCents: 47900, occurredOn: "2026-09-20" });
    // outubro: aberta (fecha 05/11), vence 20/11 -> fora do período de outubro; novembro
    await makeCardPurchase(fx, { card, amountInCents: 10000, occurredOn: "2026-10-10" });
    const r = await payables();
    expect(r.status).toBe(200);
    expect(r.body.totals.dueInCents).toBe(65000 + 47900);
    expect(r.body.groups.invoices).toHaveLength(1);
    expect(r.body.groups.invoices[0]).toMatchObject({
      title: "Fatura Nubank Roxinho",
      invoiceStatus: "CLOSED",
      amountInCents: 47900,
    });
    expect(r.body.groups.planned).toHaveLength(1);
    expect(r.body.groups.planned[0].invoiceStatus).toBeNull();
    const nov = await payables("2026-11");
    expect(nov.body.groups.invoices[0]).toMatchObject({
      invoiceStatus: "OPEN",
      amountInCents: 10000,
    });
    // paga sai
    const inv = await makeInvoice(fx, card, "2026-10");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: itau,
      amountInCents: 47900,
      paidOn: "2026-10-12",
    });
    const after = await payables();
    expect(after.body.groups.invoices).toHaveLength(0);
    expect(after.body.totals.dueInCents).toBe(65000);
  });

  it("fatura atrasada de agosto aparece só no período corrente", async () => {
    const card = await makeCard(fx, { name: "Nubank", closingDay: 5, dueDay: 10 });
    await makeCardPurchase(fx, { card, amountInCents: 30000, occurredOn: "2026-07-20" });
    const cur = await payables();
    expect(cur.body.groups.invoices).toHaveLength(1);
    expect(cur.body.groups.invoices[0].isOverdue).toBe(true);
    expect((await payables("2026-11")).body.groups.invoices).toHaveLength(0);
  });

  it("propriedade: A pagar (tela) = A pagar (Resumo) em 3 períodos, mesmos ids", async () => {
    const rnd = mulberry32(55);
    for (let round = 0; round < 25; round++) {
      await resetDb();
      fx = await makeFamily();
      const itau = await makeAccount(fx, { name: "I", owner: "Mariana", openingBalanceInCents: 0 });
      const card = await makeCard(fx, { name: "C", closingDay: 5, dueDay: 20 });
      const k = 2 + Math.floor(rnd() * 6);
      for (let i = 0; i < k; i++) {
        const month = 8 + Math.floor(rnd() * 4); // ago..nov
        const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
        const cents = 100 + Math.floor(rnd() * 99900);
        const on = `2026-${String(month).padStart(2, "0")}-${day}`;
        if (rnd() < 0.5) {
          await makePlannedExpense(fx, { description: `P${i}`, amountInCents: cents, dueOn: on });
        } else {
          await makeCardPurchase(fx, { card, amountInCents: cents, occurredOn: on });
        }
      }
      if (rnd() < 0.5) {
        const inv = await makeInvoice(fx, card, "2026-09");
        await makeInvoicePayment(fx, {
          card,
          invoice: inv,
          account: itau,
          amountInCents: 100,
          paidOn: "2026-10-05",
        });
      }
      for (const period of ["2026-09", "2026-10", "2026-11"]) {
        const p = (await payables(period)).body;
        const s = (await summary(period)).body;
        expect(p.totals.dueInCents).toBe(s.toPay.totalInCents);
        expect(p.items.length).toBe(s.toPay.totalCount);
        expect(p.items.slice(0, 5).map((i: { id: string }) => i.id)).toEqual(
          s.toPay.items.map((i: { id: string }) => i.id),
        );
      }
    }
  }, 120_000);
});
