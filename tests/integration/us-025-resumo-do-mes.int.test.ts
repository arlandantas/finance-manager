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
  makeTransfer,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const summary = (qs = "") =>
  withClock(NOW, () => call(lucas(), "GET", `/api/v1/month-summary${qs}`));
let n = 0;
const t = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++n));

beforeEach(async () => {
  await resetDb();
  n = 0;
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 650000,
  });
  nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 84950,
  });
});

const income = (cents: number, on = "2026-10-02") =>
  makeTransaction(fx, {
    account: itau,
    type: "INCOME",
    category: "Salário",
    amountInCents: cents,
    occurredOn: on,
    createdAt: t(),
  });
const expense = (
  cents: number,
  on = "2026-10-03",
  o: { payer?: string; account?: AccountFixture } = {},
) =>
  makeTransaction(fx, {
    account: o.account ?? nubank,
    category: "Moradia",
    amountInCents: cents,
    occurredOn: on,
    ...(o.payer ? { payer: o.payer, author: o.payer } : {}),
    createdAt: t(),
  });

describe("US-025 Resumo do Mês", () => {
  it("cinco números: receita, despesa, resultado, a pagar (previstas + faturas) e saldo previsto", async () => {
    await income(500000);
    await expense(120000);
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-10-20",
    });
    await makePlannedExpense(fx, {
      description: "Internet",
      amountInCents: 12990,
      dueOn: "2026-10-25",
    });
    const card = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      closingDay: 25,
      dueDay: 15,
    });
    await makeCardPurchase(fx, {
      card,
      amountInCents: 47900,
      occurredOn: "2026-09-20",
      author: "Lucas",
    });
    const res = await summary();
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.incomeInCents).toBe(500000);
    expect(b.expenseInCents).toBe(120000); // a compra de 20/09 conta em setembro; a fatura (vence 15/10) só entra em 'A pagar'
    expect(b.resultInCents).toBe(500000 - 120000);
    expect(b.toPay).toMatchObject({
      plannedInCents: 77990,
      invoicesInCents: 47900,
      totalInCents: 125890,
    });
    expect(b.currentBalanceInCents).toBe(650000 + 84950 + 500000 - 120000);
    expect(b.projectedBalanceInCents).toBe(b.currentBalanceInCents - 125890);
    expect(b.isEmpty).toBe(false);
  });

  it("saldo alto não esconde conta a pagar: previsto negativo", async () => {
    await makePlannedExpense(fx, {
      description: "Grande",
      amountInCents: 100_000_000,
      dueOn: "2026-10-20",
    });
    const b = (await summary()).body;
    expect(b.projectedBalanceInCents).toBe(650000 + 84950 - 100_000_000);
    expect(b.projectedBalanceInCents).toBeLessThan(0);
  });

  it("pagamento de fatura e transferência não são despesa nem receita", async () => {
    await expense(120000);
    const before = (await summary()).body;
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 100000,
      occurredOn: "2026-10-03",
    });
    const card = await makeCard(fx, { name: "Cartão", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(fx, { card, amountInCents: 47900, occurredOn: "2026-09-10" });
    const inv = await makeInvoice(fx, card, "2026-09");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: itau,
      amountInCents: 47900,
      paidOn: "2026-10-05",
    });
    const after = (await summary()).body;
    expect(after.expenseInCents).toBe(before.expenseInCents);
    expect(after.incomeInCents).toBe(before.incomeInCents);
  });

  it("fatura em linha própria: nunca soma em despesas; itens atrasados e mês corrente", async () => {
    const card = await makeCard(fx, { name: "Cartão", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(fx, { card, amountInCents: 30000, occurredOn: "2026-09-10" }); // fatura set, vence 05/10 (atrasada)
    await makePlannedExpense(fx, {
      description: "Velha",
      amountInCents: 12990,
      dueOn: "2026-09-20",
    });
    const b = (await summary()).body;
    expect(b.expenseInCents).toBe(0);
    expect(b.toPay.invoicesInCents).toBe(30000);
    expect(b.toPay.overdueCount).toBe(2);
    expect(b.toPay.overdueInCents).toBe(30000 + 12990);
    // mês passado (setembro): só o que ainda permanece pendente e venceu no período
    const sep = (await summary("?period=2026-09")).body;
    expect(sep.toPay.plannedInCents).toBe(12990);
    expect(sep.toPay.invoicesInCents).toBe(0);
  });

  it("navegação: setembro tem suas despesas; novembro vazio => isEmpty; além de +12 meses => 400", async () => {
    await expense(90000, "2026-09-10");
    expect((await summary("?period=2026-09")).body.expenseInCents).toBe(90000);
    const nov = (await summary("?period=2026-11")).body;
    expect(nov).toMatchObject({ isEmpty: true, resultInCents: 0 });
    expect(nov.period.isFuture).toBe(true);
    expect((await summary("?period=2027-10")).status).toBe(200);
    expect((await summary("?period=2027-11")).status).toBe(400);
  });

  it("família nova: onboarding.showChecklist na Home", async () => {
    const b = await makeFamily({ uniqueEmails: true, name: "Nova" });
    const res = await withClock(NOW, () => call(b.members[0]?.as ?? null, "GET", "/api/v1/home"));
    expect(res.body.onboarding.showChecklist).toBe(true);
  });

  it("isolamento: o resumo da família B nunca contém dados da A", async () => {
    await income(500000);
    const b = await makeFamily({ uniqueEmails: true, name: "B" });
    const res = await withClock(NOW, () =>
      call(b.members[0]?.as ?? null, "GET", "/api/v1/month-summary"),
    );
    expect(res.body).toMatchObject({ incomeInCents: 0, expenseInCents: 0, isEmpty: true });
  });

  it("propriedade (200 conjuntos, semente fixa): resumo = Extrato (income/expense) e Σ byMember = despesas", async () => {
    const rnd = mulberry32(2026);
    const names = ["Mariana", "Lucas"] as const;
    for (let round = 0; round < 200; round++) {
      await resetDb();
      fx = await makeFamily();
      itau = await makeAccount(fx, { name: "I", owner: "Mariana", openingBalanceInCents: 100000 });
      nubank = await makeAccount(fx, { name: "N", owner: "Lucas", openingBalanceInCents: 0 });
      const c = await makeCard(fx, { name: "C", closingDay: 25, dueDay: 5 });
      const k = 1 + Math.floor(rnd() * 5);
      for (let i = 0; i < k; i++) {
        const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
        const cents = 100 + Math.floor(rnd() * 99900);
        const who = names[Math.floor(rnd() * 2)] as "Mariana" | "Lucas";
        const kind = Math.floor(rnd() * 6);
        const on = `2026-10-${day}`;
        if (kind === 0) await income(cents, on);
        else if (kind === 1)
          await makeCardPurchase(fx, {
            card: c,
            amountInCents: cents,
            occurredOn: on,
            payer: who,
            author: who,
          });
        else if (kind === 2)
          await makeTransfer(fx, { from: itau, to: nubank, amountInCents: cents, occurredOn: on });
        else if (kind === 3)
          await makeTransfer(fx, {
            from: itau,
            to: nubank,
            amountInCents: cents,
            occurredOn: on,
            kind: "SETTLEMENT",
          });
        else if (kind === 4)
          await makeTransaction(fx, {
            account: itau,
            category: "Moradia",
            amountInCents: cents,
            occurredOn: on,
            deleted: true,
          });
        else await expense(cents, on, { payer: who });
      }
      const s = (await summary()).body;
      const ext = await withClock(NOW, () =>
        call(lucas(), "GET", "/api/v1/transactions?period=2026-10"),
      );
      expect(s.incomeInCents).toBe(ext.body.totals.incomeInCents);
      expect(s.expenseInCents).toBe(ext.body.totals.expenseInCents);
      const paidSum = s.byMember.reduce(
        (a: number, m: { paidInCents: number }) => a + m.paidInCents,
        0,
      );
      expect(paidSum).toBe(s.expenseInCents);
      if (paidSum > 0) {
        expect(
          s.byMember.reduce((a: number, m: { sharePercent: number }) => a + m.sharePercent, 0),
        ).toBe(100);
      }
    }
  }, 300_000);
});
