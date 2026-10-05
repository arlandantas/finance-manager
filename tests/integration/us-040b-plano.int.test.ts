import { randomUUID } from "node:crypto";
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
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let card: CardFixture;
let planId: string;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const at = async <T>(fn: () => Promise<T>, now = NOW): Promise<T> => {
  setDevClockOverride(now);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
const getPlan = (id = planId, as = lucas()) =>
  at(() => call(as, "GET", `/api/v1/installment-plans/${id}`));
const del = (
  version: number,
  o: { now?: string; as?: ReturnType<typeof lucas>; key?: string } = {},
) =>
  at(
    () =>
      call(
        o.as ?? lucas(),
        "POST",
        `/api/v1/installment-plans/${planId}/delete`,
        { version },
        o.key ? { idempotencyKey: o.key } : {},
      ),
    o.now,
  );
const restore = (version: number, o: { now?: string } = {}) =>
  at(
    () => call(lucas(), "POST", `/api/v1/installment-plans/${planId}/restore`, { version }),
    o.now,
  );
const cards = (now?: string) => at(() => call(lucas(), "GET", "/api/v1/cards"), now);
const invoice = (ref: string, now?: string) =>
  at(() => call(lucas(), "GET", `/api/v1/cards/${card.id}/invoices/${ref}`), now);

beforeEach(async () => {
  await resetDb();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  card = await makeCard(fx, {
    name: "Nubank",
    owner: "Lucas",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
  const r = await makeInstallmentPurchase(fx, {
    card,
    total: 250000,
    count: 10,
    purchaseOn: "2026-11-10",
    description: "Notebook",
    author: "Lucas",
  });
  planId = r.plan.id;
});

describe("US-040b: Ver compra", () => {
  it("GET: total 250000 e 10 parcelas com a fatura de cada uma", async () => {
    const res = await getPlan();
    expect(res.status).toBe(200);
    const p = res.body.plan;
    expect(p).toMatchObject({
      totalInCents: 250000,
      currentTotalInCents: 250000,
      activeCount: 10,
      count: 10,
      canDelete: true,
      version: 1,
    });
    expect(p.installments).toHaveLength(10);
    expect(p.installments[2]).toMatchObject({
      no: 3,
      amountInCents: 25000,
      state: "ACTIVE",
      locked: false,
      invoice: { ref: "2027-01", status: "OPEN", isFuture: true },
    });
  });

  it("depois do fechamento a 1ª parcela mostra fatura fechada e canDelete = false", async () => {
    const res = await getPlan(planId, lucas());
    expect(res.body.plan.canDelete).toBe(true);
    const later = await at(
      () => call(lucas(), "GET", `/api/v1/installment-plans/${planId}`),
      "2026-11-26T15:00:00Z",
    );
    expect(later.body.plan.installments[0]).toMatchObject({
      locked: true,
      lockedReason: "INVOICE_CLOSED",
      invoice: { status: "CLOSED" },
    });
    expect(later.body.plan).toMatchObject({
      canDelete: false,
      deleteBlockedReason: "INVOICE_CLOSED",
    });
  });
});

describe("US-040b: excluir a compra inteira e desfazer", () => {
  it("exclui: nenhuma fatura lista a compra, limite devolvido, totais sem as parcelas", async () => {
    const res = await del(1);
    expect(res.status).toBe(200);
    expect(res.body.plan).toMatchObject({ deleted: true, activeCount: 0, version: 2 });
    expect(res.body.card).toEqual({ id: card.id, usedInCents: 0, availableInCents: 500000 });
    for (const ref of ["2026-11", "2027-03", "2027-08"]) {
      expect((await invoice(ref)).body.invoice.purchases).toHaveLength(0);
    }
    expect(
      (await at(() => call(lucas(), "GET", "/api/v1/month-summary?period=2026-12"))).body
        .expenseInCents,
    ).toBe(0);
    const ext = await at(() => call(lucas(), "GET", "/api/v1/transactions?period=2026-11"));
    expect(ext.body.totals.expenseInCents).toBe(0);
    const revs = await db.transactionRevision.count({ where: { action: "DELETE" } });
    expect(revs).toBe(10);
    // todas as linhas com o MESMO carimbo
    const stamps = await db.transaction.findMany({
      where: { installmentPlanId: planId },
      select: { deletedAt: true },
    });
    expect(new Set(stamps.map((s) => s.deletedAt?.toISOString())).size).toBe(1);
  });

  it("desfazer: 10 parcelas voltam e o limite é consumido de novo", async () => {
    await del(1);
    const res = await restore(2);
    expect(res.status).toBe(200);
    expect(res.body.plan).toMatchObject({ deleted: false, activeCount: 10, version: 3 });
    expect(res.body.card).toEqual({ id: card.id, usedInCents: 250000, availableInCents: 250000 });
    expect((await invoice("2026-12")).body.invoice.purchases).toHaveLength(1);
    expect(await db.transactionRevision.count({ where: { action: "RESTORE" } })).toBe(10);
  });

  it("desfazer não ressuscita parcela removida antes por outra via (carimbo)", async () => {
    await db.$executeRaw`UPDATE transactions SET "deletedAt" = '2026-11-09T10:00:00Z'::timestamptz, "deletedByMemberId" = ${mid("Lucas")}::uuid, "deletionReason" = 'DELETED'
      WHERE "installmentPlanId" = ${planId}::uuid AND "installmentNo" = 5`;
    expect((await del(1)).status).toBe(200);
    const res = await restore(2);
    expect(res.status).toBe(200);
    expect(res.body.plan.activeCount).toBe(9);
    expect(res.body.plan.installments[4]).toMatchObject({ no: 5, state: "REMOVED" });
    expect(res.body.card.usedInCents).toBe(225000);
  });

  it("fatura fechada => 422 INSTALLMENT_PLAN_LOCKED e nada é excluído", async () => {
    const res = await del(1, { now: "2026-11-26T15:00:00Z" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSTALLMENT_PLAN_LOCKED");
    expect(res.body.error.message).toBe(
      "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas.",
    );
    expect(
      await db.transaction.count({ where: { installmentPlanId: planId, deletedAt: null } }),
    ).toBe(10);
    expect((await getPlan()).body.plan.deleted).toBe(false);
  });

  it("fatura paga => 422 INSTALLMENT_PLAN_LOCKED", async () => {
    const pay = await at(
      () =>
        call(mariana(), "POST", `/api/v1/cards/${card.id}/invoices/2026-11/pay`, {
          accountId: itau.id,
          expectedTotalInCents: 25000,
        }),
      "2026-11-26T15:00:00Z",
    );
    expect(pay.status).toBe(201);
    const res = await del(1, { now: "2026-11-27T15:00:00Z" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSTALLMENT_PLAN_LOCKED");
    const dto = (await getPlan()).body.plan;
    expect(dto.installments[0]).toMatchObject({ locked: true, lockedReason: "INVOICE_PAID" });
  });

  it("excluir de novo => 409 ALREADY_DELETED; versão antiga => 409 VERSION_CONFLICT", async () => {
    await del(1);
    const again = await del(1);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_DELETED");
    await restore(2);
    const stale = await del(1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details.currentVersion).toBe(3);
    expect(stale.body.error.message).toContain("Esta compra foi alterada por");
  });

  it("restaurar compra não excluída => 422 NOT_RESTORABLE; cartão arquivado => INVALID_REFERENCE", async () => {
    const nr = await restore(1);
    expect(nr.status).toBe(422);
    expect(nr.body.error.code).toBe("NOT_RESTORABLE");
    await del(1);
    const arch = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${card.id}/archive`, { version: 1 }),
    );
    expect(arch.status).toBe(200);
    const res = await restore(2);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
  });

  it("idempotência: mesma chave => 1 exclusão e resposta repetida", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([del(1, { key }), del(1, { key })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await db.transactionRevision.count({ where: { action: "DELETE" } })).toBe(10);
  });

  it("isolamento: outra família => 404 em GET, delete e restore", async () => {
    const outro = await makeFamily({
      name: "Outra",
      members: [{ email: "z@exemplo.com", name: "Zé", role: "ADMIN" }],
    });
    const ze = outro.byName.Zé?.as ?? null;
    for (const [m, path, body] of [
      ["GET", `/api/v1/installment-plans/${planId}`, undefined],
      ["POST", `/api/v1/installment-plans/${planId}/delete`, { version: 1 }],
      ["POST", `/api/v1/installment-plans/${planId}/restore`, { version: 1 }],
    ] as const) {
      const r = await at(() => call(ze, m, path, body));
      expect(r.status).toBe(404);
    }
    expect(
      await db.transaction.count({ where: { installmentPlanId: planId, deletedAt: null } }),
    ).toBe(10);
  });

  it("excluir × excluir (Promise.all, chaves diferentes) => 1×200 e 1×409", async () => {
    const [a, b] = await Promise.all([del(1), del(1)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("excluir × pagar a fatura 1: ou a exclusão vence ou o pagamento vence (nunca ambos)", async () => {
    const [d, p] = await Promise.all([
      del(1, { now: "2026-11-25T15:00:00Z" }),
      at(
        () =>
          call(mariana(), "POST", `/api/v1/cards/${card.id}/invoices/2026-11/pay`, {
            accountId: itau.id,
            expectedTotalInCents: 25000,
          }),
        "2026-11-26T15:00:00Z",
      ),
    ]);
    const active = await db.transaction.count({
      where: { installmentPlanId: planId, deletedAt: null },
    });
    if (d.status === 200) expect(active).toBe(0);
    else {
      expect(d.status).toBe(422);
      expect(p.status).toBe(201);
      expect(active).toBe(10);
    }
  });
});
