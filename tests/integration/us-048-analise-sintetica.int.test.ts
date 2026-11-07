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
  makeTransaction,
  makeTransfer,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
let acc2: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const analysis = (qs = "") =>
  withClock(NOW, () => call(lucas(), "GET", `/api/v1/analysis${qs ? `?${qs}` : ""}`));
let n = 0;
const t = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++n));
const expense = (category: string, cents: number, on = "2026-10-03", o = {}) =>
  makeTransaction(fx, {
    account: acc,
    category,
    amountInCents: cents,
    occurredOn: on,
    createdAt: t(),
    ...o,
  });

beforeEach(async () => {
  await resetDb();
  n = 0;
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 100000 });
  acc2 = await makeAccount(fx, { name: "Itaú", owner: "Lucas", openingBalanceInCents: 100000 });
});

async function seedOctober() {
  await makeTransaction(fx, {
    account: acc,
    type: "INCOME",
    category: "Salário",
    amountInCents: 500000,
    occurredOn: "2026-10-02",
    createdAt: t(),
  });
  await expense("Supermercado", 70000);
  await expense("Moradia", 30000);
  await expense("Lazer e restaurantes", 20000);
}

describe("US-048 análise sintética", () => {
  it("AC1/AC2: totais do mês corrente e quebra por categoria com participação exata", async () => {
    await seedOctober();
    const res = await analysis();
    expect(res.status).toBe(200);
    expect(res.body.period).toMatchObject({ key: "2026-10", isCurrent: true });
    expect(res.body.totals).toMatchObject({
      incomeInCents: 500000,
      expenseInCents: 120000,
      resultInCents: 380000,
    });
    expect(res.body.rows.map((r: { amountInCents: number }) => r.amountInCents)).toEqual([
      70000, 30000, 20000,
    ]);
    expect(res.body.rows.map((r: { permille: number }) => r.permille)).toEqual([583, 250, 167]);
    expect(res.body.rowsTotalInCents).toBe(120000);
    expect(res.body.isEmpty).toBe(false);
  });

  it("AC3: mês anterior e intervalos de até 24 meses", async () => {
    await seedOctober();
    await expense("Moradia", 900, "2026-09-10");
    const prev = await analysis("period=2026-09");
    expect(prev.body.totals.expenseInCents).toBe(900);
    expect((await analysis("from=2025-01-01&to=2026-12-31")).status).toBe(200);
    const long = await analysis("from=2024-01-01&to=2026-10-31");
    expect(long.status).toBe(400);
    expect(long.body.error.message).toBe("Escolha um intervalo de até 24 meses");
    expect((await analysis("from=2025-01-01&to=2027-01-01")).status).toBe(400);
    const inv = await analysis("from=2026-10-10&to=2026-10-01");
    expect(inv.body.error.message).toBe("Intervalo inválido");
    expect(
      (await call(lucas(), "GET", "/api/v1/transactions?from=2025-01-01&to=2026-12-31")).status,
    ).toBe(200);
  });

  it("AC4: o drill-down do Extrato soma o mesmo valor da linha", async () => {
    await seedOctober();
    const res = await analysis();
    const row = res.body.rows[0];
    expect(row.drillUrl).toMatch(/^\/extrato\?period=2026-10&type=EXPENSE&categoryId=/);
    const ext = await call(lucas(), "GET", `/api/v1/transactions?${row.drillUrl.split("?")[1]}`);
    expect(ext.body.totals.expenseInCents).toBe(70000);
  });

  it("AC6: transferência, pagamento de fatura e excluído não entram; parcela só na competência", async () => {
    await seedOctober();
    await makeTransfer(fx, { from: acc, to: acc2, amountInCents: 5000, occurredOn: "2026-10-05" });
    await expense("Moradia", 7777, "2026-10-06", { deleted: true });
    const res = await analysis();
    expect(res.body.totals.expenseInCents).toBe(120000);
    expect(res.body.rowsTotalInCents).toBe(120000);
  });

  it("AC7: período vazio e type=INCOME", async () => {
    await seedOctober();
    const empty = await analysis("period=2026-01");
    expect(empty.body.isEmpty).toBe(true);
    expect(empty.body.rows).toEqual([]);
    const inc = await analysis("type=INCOME");
    expect(inc.body.rows).toHaveLength(1);
    expect(inc.body.rows[0]).toMatchObject({
      label: "Salário",
      amountInCents: 500000,
      permille: 1000,
    });
    expect(inc.body.totals.expenseInCents).toBe(120000);
  });

  it("quebra por outra dimensão ainda não existe (US-049)", async () => {
    expect((await analysis("groupBy=tag")).status).toBe(400);
    expect((await analysis("foo=1")).status).toBe(400);
  });

  it("AC10: dados de outra família nunca entram", async () => {
    await seedOctober();
    const other = await makeFamily({
      members: [{ email: "x@exemplo.com", name: "Xis", role: "ADMIN" }],
    });
    const a = await makeAccount(other, { name: "Outra", owner: "Xis", openingBalanceInCents: 0 });
    await makeTransaction(other, {
      account: a,
      category: "Moradia",
      amountInCents: 99999,
      occurredOn: "2026-10-03",
    });
    const res = await analysis();
    expect(res.body.totals.expenseInCents).toBe(120000);
    const asOther = await withClock(NOW, () =>
      call(other.byName.Xis?.as ?? null, "GET", "/api/v1/analysis"),
    );
    expect(asOther.body.totals.expenseInCents).toBe(99999);
  });

  it("AC5: propriedade (semente fixa): totais e linhas reconciliam com Extrato e Resumo", async () => {
    const rnd = mulberry32(48);
    const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)] as T;
    const card = await makeCard(fx, { name: "Cartão", owner: "Lucas", closingDay: 25, dueDay: 15 });
    const cats = ["Supermercado", "Moradia", "Lazer e restaurantes", "Transporte"];
    for (let i = 0; i < 25; i++) {
      const day = String(1 + Math.floor(rnd() * 27)).padStart(2, "0");
      const cents = 1 + Math.floor(rnd() * 90000);
      const who = pick(["Lucas", "Mariana"]);
      const month = pick(["2026-09", "2026-10"]);
      const kind = rnd();
      if (kind < 0.55)
        await expense(pick(cats), cents, `${month}-${day}`, {
          payer: who,
          author: who,
          shared: rnd() < 0.5,
        });
      else if (kind < 0.7)
        await makeCardPurchase(fx, {
          card,
          category: pick(cats),
          amountInCents: cents,
          occurredOn: `${month}-${day}`,
          author: who,
        });
      else if (kind < 0.8)
        await makeTransfer(fx, {
          from: acc,
          to: acc2,
          amountInCents: cents,
          occurredOn: `${month}-${day}`,
        });
      else if (kind < 0.9) await expense(pick(cats), cents, `${month}-${day}`, { deleted: true });
      else
        await makeTransaction(fx, {
          account: acc,
          type: "INCOME",
          category: "Salário",
          amountInCents: cents,
          occurredOn: `${month}-${day}`,
          createdAt: t(),
        });
    }
    for (const period of ["2026-09", "2026-10"]) {
      const a = await analysis(`period=${period}`);
      const e = await call(lucas(), "GET", `/api/v1/transactions?period=${period}`);
      const s = await withClock(NOW, () =>
        call(lucas(), "GET", `/api/v1/month-summary?period=${period}`),
      );
      expect(a.body.totals.incomeInCents).toBe(e.body.totals.incomeInCents);
      expect(a.body.totals.expenseInCents).toBe(e.body.totals.expenseInCents);
      expect(a.body.totals.expenseInCents).toBe(s.body.expenseInCents);
      expect(a.body.totals.incomeInCents).toBe(s.body.incomeInCents);
      expect(a.body.rowsTotalInCents).toBe(a.body.totals.expenseInCents);
      const sum = a.body.rows.reduce((x: number, r: { permille: number }) => x + r.permille, 0);
      expect(a.body.rows.length === 0 ? 1000 : sum).toBe(1000);
    }
  });
});
