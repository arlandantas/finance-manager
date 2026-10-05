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
  makeTransaction,
  makeTransfer,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";
import { mulberry32 } from "../support/prng";

const db = testDb();
const NOW = "2026-11-28T15:00:00Z"; // depois do fechamento (25): a compra à vista de hoje é da fatura de dez
let fx: FamilyFixture;
let itau: AccountFixture;
let card: CardFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = async <T>(fn: () => Promise<T>, now = NOW): Promise<T> => {
  setDevClockOverride(now);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
const ext = (qs: string) => at(() => call(lucas(), "GET", `/api/v1/transactions?${qs}`));
const summary = (period: string) =>
  at(() => call(lucas(), "GET", `/api/v1/month-summary?period=${period}`));

beforeEach(async () => {
  await resetDb();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  card = await makeCard(fx, {
    name: "Nubank",
    owner: "Lucas",
    limitInCents: 5000000,
    closingDay: 25,
    dueDay: 5,
  });
});

describe("US-040b: competência no Extrato e no Resumo", () => {
  it("despesa do mês conta só a parcela (nov e dez)", async () => {
    await makeInstallmentPurchase(fx, {
      card,
      total: 250000,
      count: 10,
      purchaseOn: "2026-11-10",
      description: "Notebook",
      author: "Lucas",
    });
    for (const p of ["2026-11", "2026-12", "2027-08"]) {
      expect((await summary(p)).body.expenseInCents).toBe(25000);
      expect((await ext(`period=${p}`)).body.totals.expenseInCents).toBe(25000);
    }
    expect((await summary("2026-10")).body.expenseInCents).toBe(0);
    expect((await summary("2027-09")).body.expenseInCents).toBe(0);
  });

  it("Extrato por intervalo: uma linha por parcela com installment e competenceOn", async () => {
    await makeInstallmentPurchase(fx, {
      card,
      total: 250000,
      count: 10,
      purchaseOn: "2026-11-10",
      description: "Notebook",
      author: "Lucas",
    });
    const res = await ext(`cardId=${card.id}&from=2026-11-01&to=2027-08-31`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    const nos = res.body.items
      .map((i: { installment: { no: number } }) => i.installment.no)
      .sort((a: number, b: number) => a - b);
    expect(nos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      res.body.items.every((i: { installment: { count: number } }) => i.installment.count === 10),
    ).toBe(true);
    expect(res.body.totals.expenseInCents).toBe(250000);
  });

  it("parcela de compra feita depois do fechamento aparece na competência da fatura (dez), à vista segue a data (nov)", async () => {
    await makeInstallmentPurchase(fx, {
      card,
      total: 250000,
      count: 10,
      purchaseOn: "2026-11-28",
      description: "Notebook",
      author: "Lucas",
    });
    await makeCardPurchase(fx, {
      card,
      amountInCents: 9000,
      occurredOn: "2026-11-28",
      description: "Mercado",
      author: "Lucas",
    });
    const nov = (await ext("period=2026-11")).body;
    const dez = (await ext("period=2026-12")).body;
    expect(nov.items.map((i: { description: string }) => i.description)).toEqual(["Mercado"]);
    expect(dez.items.map((i: { description: string }) => i.description)).toEqual(["Notebook"]);
    expect(dez.items[0]).toMatchObject({
      occurredOn: "2026-11-28",
      competenceOn: "2026-12-25",
      invoice: { ref: "2026-12" },
      installment: { no: 1, count: 10 },
    });
    expect(nov.items[0]).toMatchObject({ competenceOn: "2026-11-28", installment: null });
  });

  it("intervalo de até 24 meses; 25 meses => 400", async () => {
    expect((await ext("from=2026-11-01&to=2028-10-31")).status).toBe(200);
    const bad = await ext("from=2026-11-01&to=2028-11-01");
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe("Escolha um intervalo de até 24 meses");
  });
});

describe("US-040b: propriedade de reconciliação (200 conjuntos, semente fixa)", () => {
  it("Extrato = Resumo = Σ byMember para todo período, com parcelas antes/depois do fechamento", async () => {
    const rnd = mulberry32(4040);
    const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    const names = ["Mariana", "Lucas"] as const;
    for (let round = 0; round < 200; round++) {
      await resetDb();
      fx = await makeFamily();
      itau = await makeAccount(fx, {
        name: "Itaú",
        owner: "Mariana",
        openingBalanceInCents: 1_000_000,
      });
      const other = await makeAccount(fx, {
        name: "Outra",
        owner: "Lucas",
        openingBalanceInCents: 0,
      });
      card = await makeCard(fx, {
        name: "Nubank",
        owner: "Lucas",
        limitInCents: 90_000_000,
        closingDay: 25,
        dueDay: 5,
      });
      const k = int(1, 5);
      for (let i = 0; i < k; i++) {
        const who = names[int(0, 1)] as (typeof names)[number];
        const on = `2026-11-${String(int(1, 28)).padStart(2, "0")}`;
        const cents = int(1000, 300000);
        const kind = int(0, 5);
        if (kind <= 1)
          await makeInstallmentPurchase(fx, {
            card,
            total: cents,
            count: int(2, 6),
            purchaseOn: on,
            description: `Parcelada ${i}`,
            author: who,
          });
        else if (kind === 2)
          await makeCardPurchase(fx, {
            card,
            amountInCents: cents,
            occurredOn: on,
            payer: who,
            author: who,
          });
        else if (kind === 3)
          await makeTransaction(fx, {
            account: itau,
            category: "Moradia",
            amountInCents: cents,
            occurredOn: on,
            payer: who,
            author: who,
          });
        else if (kind === 4)
          await makeTransfer(fx, { from: itau, to: other, amountInCents: cents, occurredOn: on });
        else
          await makeTransaction(fx, {
            account: itau,
            category: "Moradia",
            amountInCents: cents,
            occurredOn: on,
            deleted: true,
          });
      }
      setDevClockOverride("2026-12-01T15:00:00Z");
      for (const period of [
        "2026-11",
        "2026-12",
        "2027-01",
        "2027-02",
        "2027-03",
        "2027-04",
        "2027-05",
        "2027-06",
      ]) {
        const s = (await call(lucas(), "GET", `/api/v1/month-summary?period=${period}`)).body;
        const e = (await call(lucas(), "GET", `/api/v1/transactions?period=${period}&limit=100`))
          .body;
        expect(s.expenseInCents).toBe(e.totals.expenseInCents);
        expect(
          s.byMember.reduce((a: number, m: { paidInCents: number }) => a + m.paidInCents, 0),
        ).toBe(s.expenseInCents);
        const listed = e.items
          .filter(
            (i: { type: string; deletedAt: string | null }) => i.type === "EXPENSE" && !i.deletedAt,
          )
          .reduce((a: number, i: { amountInCents: number }) => a + i.amountInCents, 0);
        expect(listed).toBe(e.totals.expenseInCents);
      }
      // nada fora de competência: Σ de todas as despesas no ledger = Σ dos períodos (cada linha em exatamente um)
      const all = Number(
        (
          await db.transaction.aggregate({
            where: { kind: "EXPENSE", deletedAt: null },
            _sum: { amountInCents: true },
          })
        )._sum.amountInCents ?? 0n,
      );
      let acc = 0;
      for (const period of [
        "2026-11",
        "2026-12",
        "2027-01",
        "2027-02",
        "2027-03",
        "2027-04",
        "2027-05",
        "2027-06",
        "2027-07",
      ]) {
        acc += (await call(lucas(), "GET", `/api/v1/month-summary?period=${period}`)).body
          .expenseInCents;
      }
      expect(acc).toBe(all);
    }
  }, 600_000);
});
