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
  makeFamily,
  makeInvoicePayment,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let lucasAcc: AccountFixture;
let nubank: CardFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = (n: string) => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  setDevClockOverride(NOW);
  fx = await makeFamily({ splitEngine: "STORED" });
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  lucasAcc = await makeAccount(fx, { name: "Nu", owner: "Lucas", openingBalanceInCents: 900000 });
  nubank = await makeCard(fx, {
    name: "Nubank",
    owner: "Lucas",
    limitInCents: 900000,
    closingDay: 25,
    dueDay: 5,
  });
});

const get = (path: string, as = lucas()) => {
  setDevClockOverride(NOW);
  return call(as, "GET", path);
};
const buy = async (o: { total?: number; count?: number; on?: string; split?: unknown } = {}) => {
  const b = await makeInstallmentPurchase(fx, {
    card: nubank,
    total: o.total ?? 300000,
    count: o.count ?? 3,
    purchaseOn: o.on ?? "2026-11-10",
    description: "Geladeira",
    author: "Lucas",
    extra: o.split === undefined ? { split: { mode: "RULE" } } : { split: o.split },
  });
  setDevClockOverride(NOW);
  return b;
};
const acerto = async (period: string) => {
  const body = (await get(`/api/v1/settlement?period=${period}`)).body;
  const by = (n: string) =>
    body.members.find((m: { member: { name: string } }) => m.member.name.startsWith(n));
  return {
    shared: body.totalSharedInCents as number,
    lucasPaid: by("Lucas").paidInCents as number,
    lucasQuota: by("Lucas").quotaInCents as number,
    marianaQuota: by("Mariana").quotaInCents as number,
    body,
  };
};

describe("US-042 compra parcelada dividida", () => {
  it("AC2/AC3: R$ 3.000,00 em 3x entra R$ 1.000,00 por mês; 50/50 dá 500/500", async () => {
    await buy();
    for (const p of ["2026-11", "2026-12", "2027-01"]) {
      const a = await acerto(p);
      expect(a.lucasPaid).toBe(100000);
      expect(a.shared).toBe(100000);
    }
    const nov = await acerto("2026-11");
    expect(nov.lucasQuota).toBe(50000);
    expect(nov.marianaQuota).toBe(50000);
    expect(nov.body.suggestions[0].amountInCents).toBe(50000);
    expect((await acerto("2027-02")).shared).toBe(0);
  });

  it("grava splitMode, bps e centavos em cada parcela; isSharedExpense true", async () => {
    const b = await buy();
    const rows = await db.transaction.findMany({
      where: { installmentPlanId: b.plan.id },
      include: { splits: true },
    });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.isSharedExpense).toBe(true);
      expect(r.splitMode).toBe("RULE");
      expect(r.splits.map((s) => s.bps).sort()).toEqual([5000, 5000]);
      expect(r.splits.reduce((s, x) => s + Number(x.amountInCents), 0)).toBe(
        Number(r.amountInCents),
      );
    }
  });

  it("AC7: 100001 em 3x 50/50 pago por Lucas: 33335/33333/33333 e rateio soma a parcela", async () => {
    const b = await buy({ total: 100001 });
    const rows = (
      await db.transaction.findMany({
        where: { installmentPlanId: b.plan.id },
        include: { splits: true },
      })
    ).sort((a, c) => (a.installmentNo ?? 0) - (c.installmentNo ?? 0));
    expect(rows.map((r) => Number(r.amountInCents))).toEqual([33335, 33333, 33333]);
    expect(rows[0]?.splits.find((s) => s.memberId === mid("Lucas"))?.amountInCents).toBe(16668n);
    for (const r of rows) {
      expect(r.splits.reduce((s, x) => s + Number(x.amountInCents), 0)).toBe(
        Number(r.amountInCents),
      );
    }
  });

  it("AC4: Mariana pagar a fatura de nov com outra conta não muda o crédito de Lucas", async () => {
    const b = await buy();
    const first = await db.transaction.findFirstOrThrow({
      where: { installmentPlanId: b.plan.id, installmentNo: 1 },
    });
    await makeInvoicePayment(fx, {
      card: nubank,
      invoice: { id: first.invoiceId as string, cardId: nubank.id, ref: "2026-11" },
      account: itau,
      amountInCents: 100000,
      paidOn: "2026-11-10",
    });
    setDevClockOverride(NOW);
    const nov = await acerto("2026-11");
    expect(nov.lucasPaid).toBe(100000);
    expect(nov.shared).toBe(100000);
  });

  it("AC5: mudar a regra para 60/40 depois não altera a parcela 2/3", async () => {
    const b = await buy();
    const put = await call(mariana(), "PUT", "/api/v1/split-rule", {
      kind: "PROPORTIONAL",
      shares: [
        { memberId: mid("Lucas"), bps: 6000 },
        { memberId: mid("Mariana"), bps: 4000 },
      ],
      effectiveFrom: "2026-11-10",
    });
    expect(put.status).toBe(201);
    const dec = await acerto("2026-12");
    expect(dec.lucasQuota).toBe(50000);
    expect(dec.marianaQuota).toBe(50000);
    const p2 = await db.transaction.findFirstOrThrow({
      where: { installmentPlanId: b.plan.id, installmentNo: 2 },
      include: { splits: true },
    });
    expect(p2.splits.map((s) => s.bps).sort()).toEqual([5000, 5000]);
  });

  it("AC6: parcelado 'Só meu' deixa o acerto de nov inalterado", async () => {
    const before = await acerto("2026-11");
    await buy({ split: { mode: "NONE" } });
    const after = await acerto("2026-11");
    expect(after.shared).toBe(before.shared);
    expect(after.body.members).toEqual(before.body.members);
  });

  it("AC8: a lista de despesas do acerto traz installment {no, count}", async () => {
    await buy();
    const list = (await get("/api/v1/settlement/expenses?period=2026-11")).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      description: "Geladeira",
      amountInCents: 100000,
      installment: { no: 1, count: 3 },
    });
    await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: lucasAcc.id,
      categoryId: (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id } })).id,
      amountInCents: 1000,
      occurredOn: "2026-11-05",
      description: "Pão",
      split: { mode: "RULE" },
    });
    const noInst = (await get("/api/v1/settlement/expenses?period=2026-11")).body;
    expect(noInst.items).toHaveLength(2);
    expect(
      noInst.items.find((i: { description: string }) => i.description === "Pão").installment,
    ).toBeNull();
  });

  it("AC9: excluir a parcela 2/3 recalcula o acerto de dez (com confirmação do mês acertado)", async () => {
    const b = await buy();
    const p2 = await db.transaction.findFirstOrThrow({
      where: { installmentPlanId: b.plan.id, installmentNo: 2 },
    });
    expect((await acerto("2026-12")).shared).toBe(100000);
    const plan = await db.installmentPlan.findFirstOrThrow({ where: { id: b.plan.id } });
    const res = await call(lucas(), "POST", `/api/v1/transactions/${p2.id}/delete`, {
      version: p2.version,
      planVersion: plan.version,
    });
    expect(res.status).toBe(200);
    const dec = await acerto("2026-12");
    expect(dec.shared).toBe(0);
    expect(dec.lucasPaid).toBe(0);
    expect((await acerto("2026-11")).shared).toBe(100000);
  });

  it("editar o valor de uma parcela recalcula o rateio com os mesmos bps", async () => {
    const b = await buy();
    const p3 = await db.transaction.findFirstOrThrow({
      where: { installmentPlanId: b.plan.id, installmentNo: 3 },
    });
    const plan = await db.installmentPlan.findFirstOrThrow({ where: { id: b.plan.id } });
    const res = await call(lucas(), "PATCH", `/api/v1/transactions/${p3.id}`, {
      version: p3.version,
      planVersion: plan.version,
      scope: "ONLY_THIS",
      amountInCents: 80001,
    });
    expect(res.status).toBe(200);
    const jan = await acerto("2027-01");
    expect(jan.shared).toBe(80001);
    expect(jan.lucasQuota + jan.marianaQuota).toBe(80001);
  });

  it("AC10: Extrato = Resumo = Acerto, à vista e parcelada dividida em 28/11", async () => {
    setDevClockOverride("2026-11-28T15:00:00Z");
    const cat = (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id } })).id;
    const vista = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: lucasAcc.id,
      categoryId: cat,
      amountInCents: 20000,
      occurredOn: "2026-11-28",
      split: { mode: "RULE" },
    });
    expect(vista.status).toBe(201);
    await buy({ on: "2026-11-28" });
    const expected: Record<string, number> = {
      "2026-11": 20000,
      "2026-12": 100000,
      "2027-01": 100000,
      "2027-02": 100000,
    };
    for (const [period, cents] of Object.entries(expected)) {
      const ext = (await get(`/api/v1/transactions?period=${period}`)).body;
      const sum = (await get(`/api/v1/month-summary?period=${period}`)).body;
      expect(ext.totals.expenseInCents).toBe(cents);
      expect(sum.expenseInCents).toBe(cents);
      expect((await acerto(period)).shared).toBe(cents);
    }
  });

  it("AC1/contrato: defaults liberam o parcelado; acerto desligado => 422 SETTLEMENT_DISABLED", async () => {
    expect((await get("/api/v1/transactions/defaults")).body.split.installmentsAvailable).toBe(
      true,
    );
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    const res = await makeInstallmentPurchase(fx, {
      card: nubank,
      total: 300000,
      count: 3,
      purchaseOn: "2026-11-10",
      author: "Lucas",
      extra: { split: { mode: "RULE" } },
    }).catch((e: Error) => e.message);
    expect(String(res)).toContain("SETTLEMENT_DISABLED");
  });

  it("família LEGACY: parcelado dividido grava isSharedExpense e o acerto soma por parcela", async () => {
    await resetDb();
    setDevClockOverride(NOW);
    fx = await makeFamily();
    await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
    nubank = await makeCard(fx, { name: "Nubank", owner: "Lucas", closingDay: 25, dueDay: 5 });
    await buy();
    const nov = await acerto("2026-11");
    expect(nov.shared).toBe(100000);
    expect(nov.lucasQuota).toBe(50000);
  });
});
