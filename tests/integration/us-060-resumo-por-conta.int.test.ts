import { beforeEach, describe, expect, it } from "vitest";
import type { ZodObject } from "zod";
import { withClock } from "@/lib/clock";
import { previstasDoMes } from "@/modules/mcp/tools/previstas";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
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
import { mulberry32 } from "../support/prng";

const NOW = "2026-10-12T15:00:00Z";
const db = testDb();
let fx: FamilyFixture;
const as = (name: string) => fx.byName[name]?.as ?? null;
const get = (who: string, path: string) => withClock(NOW, () => call(as(who), "GET", path));
const payables = (period?: string, who = "Mariana") =>
  get(who, `/api/v1/payables${period ? `?period=${period}` : ""}`);
const summary = (period?: string) =>
  get("Mariana", `/api/v1/month-summary${period ? `?period=${period}` : ""}`);
type Row = {
  account: { id: string; name: string; archived: boolean; excludeFromAvailable: boolean } | null;
  balanceInCents: number | null;
  dueInCents: number;
  itemCount: number;
  projectedInCents: number | null;
  shortfallInCents: number;
};
const rowOf = (body: { byAccount: { rows: Row[] } }, name: string | null) =>
  body.byAccount.rows.find((r) => (r.account?.name ?? null) === name);

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

async function expectReconciled(period: string) {
  const p = (await payables(period)).body;
  const s = (await summary(period)).body;
  expect(p.byAccount.rows.reduce((t: number, r: Row) => t + r.dueInCents, 0)).toBe(
    p.totals.dueInCents,
  );
  expect(p.byAccount.rows.reduce((t: number, r: Row) => t + r.itemCount, 0)).toBe(p.items.length);
  expect(p.totals.dueInCents).toBe(s.toPay.totalInCents);
  return p;
}

describe("US-060 resumo por conta no A pagar (SDD-029 §8.2)", () => {
  it("saldo previsto por conta e conta que vai faltar", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    const curta = await makeAccount(fx, { name: "Curta", openingBalanceInCents: 50000 });
    await makePlannedExpense(fx, {
      description: "A",
      amountInCents: 65000,
      dueOn: "2026-10-20",
      account: corrente,
    });
    await makePlannedExpense(fx, {
      description: "B",
      amountInCents: 12000,
      dueOn: "2026-10-25",
      account: corrente,
    });
    await makePlannedExpense(fx, {
      description: "C",
      amountInCents: 77000,
      dueOn: "2026-10-26",
      account: curta,
    });
    const p = (await payables()).body;
    expect(rowOf(p, "Corrente")).toMatchObject({
      balanceInCents: 100000,
      dueInCents: 77000,
      projectedInCents: 23000,
      shortfallInCents: 0,
      itemCount: 2,
    });
    expect(rowOf(p, "Curta")).toMatchObject({ projectedInCents: -27000, shortfallInCents: 27000 });
    // as que faltam primeiro
    expect(p.byAccount.rows.map((r: Row) => r.account?.name)).toEqual(["Curta", "Corrente"]);
    expect(p.byAccount.columns).toEqual({ toReceive: false, plannedTransfers: false });
    expect(p.items.every((i: { paymentAccountId: string | null }) => i.paymentAccountId)).toBe(
      true,
    );
  });

  it("reconciliação: Σ linhas = total do A pagar = Resumo, em 3 períodos (seed fixa)", async () => {
    const rnd = mulberry32(6060);
    for (let round = 0; round < 12; round++) {
      await resetDb();
      fx = await makeFamily();
      const accounts = [
        await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 }),
        await makeAccount(fx, { name: "Poupança", openingBalanceInCents: 0 }),
        await makeAccount(fx, { name: "Reserva", openingBalanceInCents: 20000 }),
        await makeAccount(fx, { name: "Antiga", openingBalanceInCents: 5000 }),
      ];
      await db.bankAccount.update({
        where: { id: accounts[2]?.id as string },
        data: { excludeFromAvailable: true },
      });
      const card = await makeCard(fx, { name: "C", closingDay: 5, dueDay: 20 });
      const k = 3 + Math.floor(rnd() * 8);
      for (let i = 0; i < k; i++) {
        const month = 8 + Math.floor(rnd() * 4); // ago..nov
        const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
        const on = `2026-${String(month).padStart(2, "0")}-${day}`;
        const cents = 100 + Math.floor(rnd() * 99900);
        const pick = Math.floor(rnd() * 6);
        if (pick === 5) {
          await makeCardPurchase(fx, { card, amountInCents: cents, occurredOn: on });
        } else {
          const a = accounts[pick];
          await makePlannedExpense(fx, {
            description: `P${i}`,
            amountInCents: cents,
            dueOn: on,
            responsible: rnd() < 0.5 ? "Lucas" : "Mariana",
            shared: rnd() < 0.5,
            ...(a ? { account: a } : {}),
          });
        }
      }
      if (rnd() < 0.5) {
        const inv = await makeInvoice(fx, card, "2026-09");
        await makeInvoicePayment(fx, {
          card,
          invoice: inv,
          account: accounts[0] as (typeof accounts)[number],
          amountInCents: 100,
          paidOn: "2026-10-05",
        });
      }
      await db.bankAccount.update({
        where: { id: accounts[3]?.id as string },
        data: { archivedAt: new Date("2026-10-01T00:00:00Z") },
      });
      for (const period of ["2026-09", "2026-10", "2026-11"]) await expectReconciled(period);
    }
  }, 180_000);

  it("'Só meu' de outro membro entra no a pagar da conta (Q-U24) e nada vaza", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    await makePlannedExpense(fx, {
      description: "Segredo do Lucas",
      amountInCents: 30000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
      note: "observação privada",
      account: corrente,
    });
    const p = (await payables(undefined, "Mariana")).body;
    expect(rowOf(p, "Corrente")).toMatchObject({
      dueInCents: 30000,
      projectedInCents: 70000,
      itemCount: 1,
    });
    expect(p.items).toHaveLength(1);
    const json = JSON.stringify(p.byAccount);
    expect(json).not.toContain("Segredo");
    expect(json).not.toContain("observação");
    expect(json).not.toContain("authorId");
    expect(json).not.toContain("responsible");
  });

  it("previstas sem conta e fatura (sem conta pagadora) caem em 'Sem conta definida', por último", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 1000 });
    await makePlannedExpense(fx, {
      description: "Avulsa",
      amountInCents: 10000,
      dueOn: "2026-10-20",
    });
    await makePlannedExpense(fx, {
      description: "Na conta",
      amountInCents: 5000,
      dueOn: "2026-10-21",
      account: corrente,
    });
    const card = await makeCard(fx, { name: "Nubank Lucas", closingDay: 5, dueDay: 20 });
    await makeCardPurchase(fx, { card, amountInCents: 150000, occurredOn: "2026-09-20" });
    const p = await expectReconciled("2026-10");
    const last = p.byAccount.rows.at(-1);
    expect(last).toMatchObject({
      account: null,
      balanceInCents: null,
      dueInCents: 160000,
      itemCount: 2,
      projectedInCents: null,
      shortfallInCents: 0,
    });
    expect(p.byAccount.rows[0].account.name).toBe("Corrente"); // falta, mas "sem conta" é a última
  });

  // US-089 (SDD-030 §3.5): a fatura soma na conta pagadora ATIVA do cartão.
  it("fatura fechada de 1.500 de cartão com conta pagadora Corrente soma na linha Corrente", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    const card = await makeCard(fx, {
      name: "Nubank",
      closingDay: 25,
      dueDay: 5,
      paymentAccount: corrente,
    });
    await makeCardPurchase(fx, { card, amountInCents: 150000, occurredOn: "2026-09-10" });
    await makePlannedExpense(fx, {
      description: "A",
      amountInCents: 20000,
      dueOn: "2026-10-20",
      account: corrente,
    });
    const p = (await expectReconciled("2026-10")) as never;
    expect(rowOf(p, "Corrente")).toMatchObject({ dueInCents: 170000, itemCount: 2 });
    expect(rowOf(p, null)).toBeUndefined();
  });

  it("baixa: saldo e a pagar caem juntos, previsto não muda; estorno desfaz", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    const grande = await makePlannedExpense(fx, {
      description: "Grande",
      amountInCents: 65000,
      dueOn: "2026-10-20",
      account: corrente,
    });
    await makePlannedExpense(fx, {
      description: "Pequena",
      amountInCents: 12000,
      dueOn: "2026-10-22",
      account: corrente,
    });
    const before = rowOf((await payables()).body, "Corrente");
    expect(before).toMatchObject({ dueInCents: 77000, projectedInCents: 23000 });
    const paid = await withClock(NOW, () =>
      call(as("Mariana"), "POST", `/api/v1/planned-expenses/${grande.id}/pay`, {
        version: 1,
        accountId: corrente.id,
      }),
    );
    expect(paid.status).toBe(201);
    const after = rowOf((await expectReconciled("2026-10")) as never, "Corrente");
    expect(after).toMatchObject({
      balanceInCents: 35000,
      dueInCents: 12000,
      projectedInCents: 23000,
    });
    const planned = (await call(as("Mariana"), "GET", `/api/v1/planned-expenses/${grande.id}`)).body
      .plannedExpense;
    const undone = await withClock(NOW, () =>
      call(as("Mariana"), "POST", `/api/v1/planned-expenses/${grande.id}/undo-payment`, {
        version: planned.version,
      }),
    );
    expect(undone.status).toBe(200);
    expect(rowOf((await payables()).body, "Corrente")).toMatchObject({
      balanceInCents: 100000,
      dueInCents: 77000,
      projectedInCents: 23000,
    });
  });

  it("pagar a fatura tira a linha 'Sem conta definida' e baixa o saldo da conta escolhida", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 500000 });
    const card = await makeCard(fx, { name: "Nubank", closingDay: 5, dueDay: 20 });
    await makeCardPurchase(fx, { card, amountInCents: 150000, occurredOn: "2026-09-20" });
    expect(rowOf((await payables("2026-10")).body, null)).toMatchObject({ dueInCents: 150000 });
    const inv = await makeInvoice(fx, card, "2026-10");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: corrente,
      amountInCents: 150000,
      paidOn: "2026-10-12",
    });
    const p = await expectReconciled("2026-10");
    expect(rowOf(p, null)).toBeUndefined();
    expect(p.totals.dueInCents).toBe(0);
  });

  it("mês futuro e passado (D-PO-42): mesmo saldo de hoje, a pagar só do período", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    await makePlannedExpense(fx, {
      description: "Atrasada",
      amountInCents: 10000,
      dueOn: "2026-09-10",
      account: corrente,
    });
    await makePlannedExpense(fx, {
      description: "Out",
      amountInCents: 20000,
      dueOn: "2026-10-20",
      account: corrente,
    });
    await makePlannedExpense(fx, {
      description: "Nov",
      amountInCents: 30000,
      dueOn: "2026-11-10",
      account: corrente,
    });
    const cur = rowOf((await payables()).body, "Corrente");
    const nov = rowOf((await payables("2026-11")).body, "Corrente");
    const set = rowOf((await payables("2026-09")).body, "Corrente");
    expect(cur).toMatchObject({ balanceInCents: 100000, dueInCents: 30000, itemCount: 2 }); // atrasada + out
    expect(nov).toMatchObject({ balanceInCents: 100000, dueInCents: 30000, itemCount: 1 });
    expect(nov?.projectedInCents).toBe(70000);
    expect(set).toMatchObject({ balanceInCents: 100000, dueInCents: 10000, itemCount: 1 });
  });

  it("contas: arquivada/reserva só com a pagar; ativa zerada e sem nada some", async () => {
    const arq = await makeAccount(fx, { name: "Arquivada", openingBalanceInCents: 0 });
    const arq2 = await makeAccount(fx, { name: "Arquivada saldo", openingBalanceInCents: 9000 });
    const res = await makeAccount(fx, { name: "Reserva", openingBalanceInCents: 50000 });
    const res2 = await makeAccount(fx, { name: "Reserva paga", openingBalanceInCents: 50000 });
    await makeAccount(fx, { name: "Zerada", openingBalanceInCents: 0 });
    await makeAccount(fx, { name: "Com saldo", openingBalanceInCents: 700 });
    const archivedAt = new Date("2026-10-01T00:00:00Z");
    await db.bankAccount.updateMany({
      where: { id: { in: [arq.id, arq2.id] } },
      data: { archivedAt },
    });
    await db.bankAccount.updateMany({
      where: { id: { in: [res.id, res2.id] } },
      data: { excludeFromAvailable: true },
    });
    await makePlannedExpense(fx, {
      description: "X",
      amountInCents: 1000,
      dueOn: "2026-10-20",
      account: arq,
    });
    await makePlannedExpense(fx, {
      description: "Y",
      amountInCents: 2000,
      dueOn: "2026-10-20",
      account: res2,
    });
    const p = (await payables()).body;
    const names = p.byAccount.rows.map((r: Row) => r.account?.name).sort();
    expect(names).toEqual(["Arquivada", "Com saldo", "Reserva paga"]);
    expect(rowOf(p, "Arquivada")?.account?.archived).toBe(true);
    expect(rowOf(p, "Reserva paga")?.account?.excludeFromAvailable).toBe(true);
  });

  it("isolamento: outra família nunca aparece", async () => {
    const mine = await makeAccount(fx, { name: "Minha", openingBalanceInCents: 1000 });
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    const theirs = await makeAccount(other, { name: "Deles", openingBalanceInCents: 99999 });
    await makePlannedExpense(other, {
      description: "Deles",
      amountInCents: 5000,
      dueOn: "2026-10-20",
      account: theirs,
    });
    await makePlannedExpense(fx, {
      description: "Meu",
      amountInCents: 100,
      dueOn: "2026-10-20",
      account: mine,
    });
    const p = (await payables()).body;
    expect(p.byAccount.rows.map((r: Row) => r.account?.name)).toEqual(["Minha"]);
    expect(JSON.stringify(p)).not.toContain("Deles");
    await expectReconciled("2026-10");
  });

  it("instantâneo: lançamento gravado em paralelo não quebra a identidade da soma", async () => {
    const corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 100000 });
    await makePlannedExpense(fx, {
      description: "A",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      account: corrente,
    });
    const [p] = await Promise.all([
      payables(),
      makeTransaction(fx, {
        account: corrente,
        category: "Moradia",
        amountInCents: 1234,
        occurredOn: "2026-10-12",
      }),
    ]);
    expect(p.status).toBe(200);
    expect(p.body.byAccount.rows.reduce((t: number, r: Row) => t + r.dueInCents, 0)).toBe(
      p.body.totals.dueInCents,
    );
    const bal = rowOf(p.body, "Corrente")?.balanceInCents;
    expect([100000, 100000 - 1234]).toContain(bal);
  });

  it("MCP previstas_do_mes segue sem byAccount (Output strict inalterado)", () => {
    const shape = (previstasDoMes.output as unknown as ZodObject).shape;
    expect(Object.keys(shape).sort()).toEqual(["currency", "items", "period", "totals"]);
  });

  it("periodo inválido continua 400", async () => {
    expect((await payables("2026-13")).status).toBe(400);
  });
});
