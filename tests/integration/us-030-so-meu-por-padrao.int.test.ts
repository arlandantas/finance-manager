import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const cat = async (n: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: n } })).id;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "N", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-030 Só meu por padrão", () => {
  it("POST sem isSharedExpense grava false; com true e regra igual, cota 15000 para cada membro em 30000", async () => {
    const base = async () => ({
      type: "EXPENSE",
      accountId: acc.id,
      categoryId: await cat("Supermercado"),
      amountInCents: 30000,
    });
    const solo = await at(async () => call(lucas(), "POST", "/api/v1/transactions", await base()));
    expect(solo.body.transaction.isSharedExpense).toBe(false);
    expect(
      (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body.totalSharedInCents,
    ).toBe(0);
    const shared = await at(async () =>
      call(lucas(), "POST", "/api/v1/transactions", { ...(await base()), isSharedExpense: true }),
    );
    expect(shared.body.transaction.isSharedExpense).toBe(true);
    const s = (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body;
    expect(s.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([15000, 15000]);
  });

  it("previsão nasce Só meu; a baixa herda", async () => {
    const res = await at(async () =>
      call(lucas(), "POST", "/api/v1/planned-expenses", {
        description: "Luz",
        amountInCents: 10000,
        categoryId: await cat("Moradia"),
        dueOn: "2026-10-20",
      }),
    );
    expect(res.body.plannedExpense.isSharedExpense).toBe(false);
    const pay = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-expenses/${res.body.plannedExpense.id}/pay`, {
        version: 1,
        accountId: acc.id,
      }),
    );
    expect(pay.status).toBe(201);
    expect(pay.body.transaction.isSharedExpense).toBe(false);
  });

  it("lançamentos e previsões antigas preservam a marcação", async () => {
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 15050,
      occurredOn: "2026-10-03",
      author: "Lucas",
      shared: true,
    });
    await makePlannedExpense(fx, {
      description: "Antiga",
      amountInCents: 100,
      dueOn: "2026-10-20",
      shared: true,
    });
    expect(
      (await db.transaction.findFirstOrThrow({ where: { kind: "EXPENSE" } })).isSharedExpense,
    ).toBe(true);
    expect((await db.plannedExpense.findFirstOrThrow()).isSharedExpense).toBe(true);
  });

  it("defaults.split: available com 2 membros e acerto ligado (ruleShares 50/50); não disponível com um membro", async () => {
    const d = (await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"))).body.split;
    expect(d.available).toBe(true);
    expect(d.ruleShares.map((s: { bps: number }) => s.bps)).toEqual([5000, 5000]);
    const solo = await makeFamily({
      uniqueEmails: true,
      name: "Solo",
      members: [{ email: `solo${Date.now()}@exemplo.com`, name: "Ana", role: "ADMIN" }],
    });
    const sd = (
      await at(() => call(solo.members[0]?.as ?? null, "GET", "/api/v1/transactions/defaults"))
    ).body.split;
    expect(sd).toEqual({ available: false, ruleShares: null });
  });

  it("settlement.personal: conta despesas Só meu de todos os pagadores, ignora excluídas, comuns e receitas", async () => {
    const mk = (cents: number, o: Record<string, unknown> = {}) =>
      makeTransaction(fx, {
        account: acc,
        category: "Supermercado",
        amountInCents: cents,
        occurredOn: "2026-10-03",
        author: "Lucas",
        shared: false,
        ...o,
      });
    await mk(8000);
    await mk(4500, { author: "Mariana", payer: "Mariana" });
    await mk(9999, { deleted: true });
    await mk(10000, { shared: true });
    await makeTransaction(fx, {
      account: acc,
      type: "INCOME",
      category: "Salário",
      amountInCents: 777,
      occurredOn: "2026-10-03",
    });
    const s = (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body;
    expect(s.personal).toEqual({ count: 2, totalInCents: 12500 });
    expect(s.totalSharedInCents).toBe(10000);
  });
});
