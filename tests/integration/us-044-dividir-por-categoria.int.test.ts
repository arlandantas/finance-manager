import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeTransaction,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = (n: string) => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;
const patchCat = (id: string, body: Record<string, unknown>, as = lucas()) =>
  at(() => call(as, "PATCH", `/api/v1/categories/${id}`, body));
const review = (period: string, as = lucas()) =>
  at(() => call(as, "GET", `/api/v1/settlement/review?period=${period}`));
const dismiss = (period: string, as = lucas()) =>
  at(() => call(as, "POST", "/api/v1/settlement/review/dismiss", { period }));
const personal = (amountInCents: number, occurredOn: string, description?: string) =>
  makeTransaction(fx, {
    account: acc,
    category: "Supermercado",
    amountInCents,
    occurredOn,
    shared: false,
    author: "Lucas",
    ...(description ? { description } : {}),
  });

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ splitEngine: "STORED" });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 1_000_000 });
});

describe("US-044 categoria que divide por padrão", () => {
  it("AC1: qualquer membro marca e desmarca; versão sobe; receita é 422; arquivar preserva", async () => {
    const id = await catId("Supermercado");
    const cat = (await at(() => call(lucas(), "GET", "/api/v1/categories?kind=EXPENSE"))).body
      .items;
    expect(cat.find((c: { id: string }) => c.id === id).defaultSplit).toBe(false);
    const res = await patchCat(id, { version: 1, defaultSplit: true });
    expect(res.status).toBe(200);
    expect(res.body.category).toMatchObject({ defaultSplit: true, version: 2 });
    const mem = await patchCat(id, { version: 2, defaultSplit: false }, mariana());
    expect(mem.body.category.defaultSplit).toBe(false);
    await patchCat(id, { version: 3, defaultSplit: true });
    const arch = await at(() =>
      call(lucas(), "POST", `/api/v1/categories/${id}/archive`, { version: 4 }),
    );
    expect(arch.status).toBe(200);
    expect((await db.category.findFirstOrThrow({ where: { id } })).defaultSplit).toBe(true);
    const income = await catId("Salário");
    const bad = await patchCat(income, { version: 1, defaultSplit: true });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("DEFAULT_SPLIT_EXPENSE_ONLY");
  });

  it("AC9: acerto desligado => 422 SETTLEMENT_DISABLED ao marcar", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    const res = await patchCat(await catId("Supermercado"), { version: 1, defaultSplit: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SETTLEMENT_DISABLED");
  });
});

describe("US-044 revisão de despesas Só meu do mês encerrado", () => {
  it("AC4: mês encerrado lista as Só meu (sem parcelas, sem divididas), ordenadas; leitura não escreve", async () => {
    await personal(8000, "2026-09-10", "Feira");
    await personal(4500, "2026-09-20", "Padaria");
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 9900,
      occurredOn: "2026-09-12",
      shared: true,
    });
    const card = await makeCard(fx, { name: "Nubank", owner: "Mariana" });
    await makeInstallmentPurchase(fx, {
      card,
      total: 120000,
      count: 3,
      purchaseOn: "2026-09-05",
      description: "TV",
    });
    const before = await db.transaction.count();
    const res = await review("2026-09");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      eligible: true,
      dismissed: false,
      count: 2,
      totalInCents: 12500,
    });
    expect(res.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Padaria",
      "Feira",
    ]);
    expect(res.body.items[0]).toMatchObject({ amountInCents: 4500, version: 1 });
    expect(await db.transaction.count()).toBe(before);
    expect(await db.settlementReviewDismissal.count()).toBe(0);
  });

  it("AC5: Dividir (PATCH RULE) grava 2250 para cada membro", async () => {
    const t = await personal(4500, "2026-09-20", "Padaria");
    const res = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        split: { mode: "RULE" },
      }),
    );
    expect(res.status).toBe(200);
    const rows = await db.transactionSplit.findMany({ where: { transactionId: t.id } });
    expect(rows.map((r) => Number(r.amountInCents))).toEqual([2250, 2250]);
    expect((await review("2026-09")).body.count).toBe(0);
  });

  it("AC6: dismiss dispensa e repetir devolve 200 sem duplicar", async () => {
    await personal(8000, "2026-09-10");
    const a = await dismiss("2026-09");
    expect(a.status).toBe(200);
    const b = await dismiss("2026-09", mariana());
    expect(b.status).toBe(200);
    expect(await db.settlementReviewDismissal.count()).toBe(1);
    expect((await review("2026-09")).body).toMatchObject({ dismissed: true, count: 1 });
  });

  it("AC7: mês em andamento não é elegível e dismiss => 422 PERIOD_NOT_ENDED", async () => {
    await personal(8000, "2026-10-05");
    const r = await review("2026-10");
    expect(r.body).toMatchObject({ eligible: false, count: 0, items: [] });
    const d = await dismiss("2026-10");
    expect(d.status).toBe(422);
    expect(d.body.error.code).toBe("PERIOD_NOT_ENDED");
  });

  it("AC8: dividir em mês já acertado exige confirmação (409)", async () => {
    const shared = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 20000,
      occurredOn: "2026-09-03",
      payer: "Lucas",
      shared: true,
    });
    expect(shared.id).toBeTruthy();
    const t = await personal(4500, "2026-09-20");
    const nub = await makeAccount(fx, { name: "Nubank", owner: "Lucas", openingBalanceInCents: 0 });
    const st = await at(() =>
      call(mariana(), "POST", "/api/v1/settlements", {
        period: "2026-09",
        fromMemberId: mid("Mariana"),
        toMemberId: mid("Lucas"),
        amountInCents: 10000,
        fromAccountId: acc.id,
        toAccountId: nub.id,
      }),
    );
    expect(st.status).toBe(201);
    const url = `/api/v1/transactions/${t.id}`;
    const no = await at(() => call(lucas(), "PATCH", url, { version: 1, split: { mode: "RULE" } }));
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
    const ok = await at(() =>
      call(lucas(), "PATCH", url, {
        version: 1,
        split: { mode: "RULE" },
        confirmSettledPeriod: true,
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("AC9: acerto desligado => review e dismiss 409", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    expect((await review("2026-09")).status).toBe(409);
    const d = await dismiss("2026-09");
    expect(d.status).toBe(409);
    expect(d.body.error.code).toBe("SETTLEMENT_DISABLED");
  });
});
