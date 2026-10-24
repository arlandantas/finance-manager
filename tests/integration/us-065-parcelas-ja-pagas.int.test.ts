import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { INSTALLMENT_SPLIT_RELEASED } from "@/modules/cartoes/installments";
import * as ledger from "@/modules/contas/ledger";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z"; // hoje = 10/11/2026; fechamento 25 => fatura aberta = nov
let fx: FamilyFixture;
let nubank: CardFixture;
let itau: Awaited<ReturnType<typeof makeAccount>>;
let supermercado: string;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Lucas", openingBalanceInCents: 100000 });
  nubank = await makeCard(fx, {
    name: "Nubank",
    owner: "Lucas",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
  supermercado = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } })
  ).id;
});

const buy = (body: Record<string, unknown> = {}, key?: string) =>
  call(
    lucas(),
    "POST",
    "/api/v1/transactions",
    {
      type: "EXPENSE",
      cardId: nubank.id,
      categoryId: supermercado,
      description: "Sofá",
      amountInCents: 250000,
      installments: 10,
      paidBeforeApp: 4,
      ...body,
    },
    key ? { idempotencyKey: key } : {},
  );
const get = (path: string) => call(lucas(), "GET", path);
const invoice = (ref: string) => get(`/api/v1/cards/${nubank.id}/invoices/${ref}`);
const available = async () =>
  ((await get("/api/v1/cards")).body.items as Array<{ id: string; availableInCents: number }>).find(
    (c) => c.id === nubank.id,
  )?.availableInCents;

describe("US-065: só as restantes viram lançamentos", () => {
  it("2.500,00 em 10x com 4 pagas => 6 linhas 5/10..10/10, nada em out/2027-05", async () => {
    const res = await buy();
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      amountInCents: 25000,
      installment: { no: 5, count: 10 },
      invoice: { ref: "2026-11" },
    });
    expect(res.body.card).toMatchObject({ usedInCents: 150000, availableInCents: 350000 });
    const plan = res.body.plan;
    expect(plan).toMatchObject({
      count: 10,
      totalInCents: 250000,
      currentTotalInCents: 150000,
      activeCount: 6,
      purchaseOnKnown: false,
      purchaseOn: "2026-11-10",
      paidBeforeApp: { count: 4, fromNo: 1, toNo: 4, amountInCents: 100000 },
    });
    expect(plan.installments).toHaveLength(6);
    const rows = await db.transaction.findMany({
      where: { installmentPlanId: plan.id },
      orderBy: { installmentNo: "asc" },
    });
    expect(rows.map((r) => r.installmentNo)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(await db.installmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({
      paidBeforeAppCount: 4,
    });
    const nov = (await invoice("2026-11")).body.invoice;
    expect(nov.purchases[0]).toMatchObject({
      description: "Sofá",
      amountInCents: 25000,
      installment: { no: 5, count: 10 },
    });
    const abr = (await invoice("2027-04")).body.invoice;
    expect(abr.purchases[0]).toMatchObject({ installment: { no: 10, count: 10 } });
    expect(
      await db.cardInvoice.count({ where: { cardId: nubank.id, referenceMonth: "2027-05" } }),
    ).toBe(0);
    const rev = await db.transactionRevision.findFirstOrThrow({
      where: { transactionId: rows[0]?.id, action: "CREATE" },
    });
    expect(JSON.stringify(rev.changes)).toContain('"paidBeforeApp":4');
  });

  it("nada em meses passados e saldos/Resumo/acerto intocados", async () => {
    const accountsBefore = (await get("/api/v1/accounts")).body;
    const summaryBefore = (await get("/api/v1/month-summary?period=2026-10")).body;
    const settlementBefore = (await get("/api/v1/settlement?period=2026-11")).body;
    expect((await buy()).status).toBe(201);
    const ext = await get("/api/v1/transactions?period=2026-10");
    expect(JSON.stringify(ext.body)).not.toContain("Sofá");
    expect(JSON.stringify((await invoice("2026-10")).body)).not.toContain("Sofá");
    expect((await get("/api/v1/accounts")).body).toEqual(accountsBefore);
    expect((await get("/api/v1/month-summary?period=2026-10")).body).toEqual(summaryBefore);
    // o acerto (saldos/diferenças dos membros) não muda; só o aviso informativo da US-052 conta a parcela
    // restante de nov (25.000), jamais as pagas
    const settlementAfter = (await get("/api/v1/settlement?period=2026-11")).body;
    expect(settlementAfter.members).toEqual(settlementBefore.members);
    expect(settlementAfter.installmentsOutside).toEqual({ count: 1, totalInCents: 25000 });
    expect(itau.id).toBeTruthy();
  });

  it("limite: 5.000,00 => 3.500,00; excluir => 5.000,00; restaurar => 3.500,00", async () => {
    expect(await available()).toBe(500000);
    const res = await buy();
    expect(await available()).toBe(350000);
    const planId = res.body.plan.id as string;
    const del = await call(lucas(), "POST", `/api/v1/installment-plans/${planId}/delete`, {
      version: res.body.plan.version,
    });
    expect(del.status).toBe(200);
    expect(await available()).toBe(500000);
    expect((await invoice("2026-11")).body.invoice.purchases).toHaveLength(0);
    const rest = await call(lucas(), "POST", `/api/v1/installment-plans/${planId}/restore`, {
      version: del.body.plan.version,
    });
    expect(rest.status).toBe(200);
    expect(rest.body.plan.activeCount).toBe(6);
    expect(await available()).toBe(350000);
  });

  it("GET do plano: bloco 'anteriores ao app' e 6 parcelas", async () => {
    const res = await buy();
    const plan = await get(`/api/v1/installment-plans/${res.body.plan.id}`);
    expect(plan.status).toBe(200);
    expect(plan.body.plan).toMatchObject({
      paidBeforeApp: { count: 4, toNo: 4, amountInCents: 100000 },
      purchaseOnKnown: false,
    });
    expect(plan.body.plan.installments).toHaveLength(6);
  });

  it("resto de centavos: 100001 em 3x com 1 paga => 2 parcelas de 33333", async () => {
    const res = await buy({ amountInCents: 100001, installments: 3, paidBeforeApp: 1 });
    expect(res.status).toBe(201);
    expect(
      res.body.plan.installments.map((p: { amountInCents: number }) => p.amountInCents),
    ).toEqual([33333, 33333]);
    expect(res.body.plan.paidBeforeApp.amountInCents).toBe(33335);
    expect(res.body.plan.currentTotalInCents + res.body.plan.paidBeforeApp.amountInCents).toBe(
      100001,
    );
  });

  it("resta 1 parcela (10x, 9 pagas) é válido", async () => {
    const res = await buy({ paidBeforeApp: 9 });
    expect(res.status).toBe(201);
    expect(res.body.plan.installments).toHaveLength(1);
    expect(res.body.transaction.installment).toMatchObject({ no: 10, count: 10 });
  });

  it("paidBeforeApp 0 ou ausente = comportamento anterior (10 linhas)", async () => {
    const res = await buy({ paidBeforeApp: 0 });
    expect(res.status).toBe(201);
    expect(res.body.plan.installments).toHaveLength(10);
    expect(res.body.plan).toMatchObject({ paidBeforeApp: null, purchaseOnKnown: true });
  });

  it("âncora na fatura fechada e não paga (out): 1ª restante em 2026-10", async () => {
    const res = await buy({ occurredOn: "2026-10-25" });
    expect(res.status).toBe(201);
    expect(res.body.transaction.invoice.ref).toBe("2026-10");
    expect(res.body.plan.installments).toHaveLength(6);
    expect(res.body.plan.installments[5].invoice.ref).toBe("2027-03");
  });

  it("âncora numa fatura fechada já paga => 422 INVOICE_ALREADY_PAID, nada gravado", async () => {
    const inv = await makeInvoice(fx, nubank, "2026-10");
    await makeCardPurchase(fx, { card: nubank, amountInCents: 1000, occurredOn: "2026-10-05" });
    await makeInvoicePayment(fx, {
      card: nubank,
      invoice: inv,
      account: itau,
      amountInCents: 1000,
      paidOn: "2026-10-30",
    });
    const res = await buy({ occurredOn: "2026-10-25" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(await db.installmentPlan.count()).toBe(0);
  });
});

describe("US-065: validações", () => {
  it("todas pagas => 400 com a mensagem; 2 pagas em 1x => 400", async () => {
    const a = await buy({ paidBeforeApp: 10 });
    expect(a.status).toBe(400);
    expect(JSON.stringify(a.body)).toContain(
      "Informe menos parcelas pagas do que o total do parcelamento",
    );
    const b = await buy({ installments: 1, paidBeforeApp: 2 });
    expect(b.status).toBe(400);
    expect(JSON.stringify(b.body)).toContain("Parcelas já pagas só valem para compra parcelada");
    const c = await buy({ paidBeforeApp: 1.5 });
    expect(c.status).toBe(400);
    expect(JSON.stringify(c.body)).toContain("Informe um número inteiro de parcelas pagas");
    const d = await buy({ paidBeforeApp: -1 });
    expect(d.status).toBe(400);
    expect(await db.installmentPlan.count()).toBe(0);
  });

  it("paidBeforeAppCount e installmentNo vindos do cliente são rejeitados (strict)", async () => {
    expect((await buy({ paidBeforeAppCount: 4 })).status).toBe(400);
    expect((await buy({ installmentNo: 5 })).status).toBe(400);
  });

  it("Só meu: dividir continua indisponível (INSTALLMENT_SPLIT_UNAVAILABLE) e o acerto não muda", async () => {
    if (INSTALLMENT_SPLIT_RELEASED) return; // cenário @depende-us-042 cobre o caso liberado
    const before = (await get("/api/v1/settlement?period=2026-11")).body;
    const res = await buy({ isSharedExpense: true });
    expect([422, 400]).toContain(res.status);
    expect((await get("/api/v1/settlement?period=2026-11")).body).toEqual(before);
  });

  it.skipIf(!INSTALLMENT_SPLIT_RELEASED)(
    "@depende-us-042: restantes entram no acerto de nov (250,00 pagos por Lucas); out inalterado",
    async () => {
      const out = (await get("/api/v1/settlement?period=2026-10")).body;
      const res = await buy({ isSharedExpense: true });
      expect(res.status).toBe(201);
      expect(JSON.stringify((await get("/api/v1/settlement?period=2026-11")).body)).toContain(
        "25000",
      );
      expect((await get("/api/v1/settlement?period=2026-10")).body).toEqual(out);
    },
  );
});

describe("US-065: idempotência, atomicidade e banco", () => {
  it("mesma chave em paralelo => 1 plano com 6 linhas", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([buy({}, key), buy({}, key)]);
    expect([a.status, b.status].every((s) => s === 201)).toBe(true);
    expect(await db.installmentPlan.count()).toBe(1);
    expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(6);
  });

  it("falha na 3ª revisão => nada gravado", async () => {
    let n = 0;
    const real = ledger.recordRevision;
    vi.spyOn(ledger, "recordRevision").mockImplementation(async (...args) => {
      if (++n === 3) throw new Error("falha injetada");
      return real(...args);
    });
    const res = await buy();
    expect(res.status).toBe(500);
    expect(await db.installmentPlan.count()).toBe(0);
    expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(0);
  });

  it("paidBeforeAppCount é imutável e o CHECK barra P = N", async () => {
    const res = await buy();
    const id = res.body.plan.id as string;
    await expect(
      db.$executeRawUnsafe(
        `UPDATE installment_plans SET "paidBeforeAppCount" = 0 WHERE id = '${id}'`,
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.$executeRawUnsafe(
        `UPDATE installment_plans SET "installmentCount" = 4 WHERE id = '${id}'`,
      ),
    ).rejects.toThrow(/installment_plans_paid_before_chk/);
    // atualizações que não tocam o contador seguem permitidas
    await db.$executeRawUnsafe(
      `UPDATE installment_plans SET "description" = 'Sofá 2' WHERE id = '${id}'`,
    );
  });

  it("planos de outra família não aparecem (isolamento do DTO novo)", async () => {
    const res = await buy();
    const outro = await makeFamily({
      name: "Outra",
      members: [{ email: "z@exemplo.com", name: "Zé", role: "ADMIN" }],
    });
    const r = await call(
      outro.byName.Zé?.as ?? null,
      "GET",
      `/api/v1/installment-plans/${res.body.plan.id}`,
    );
    expect(r.status).toBe(404);
  });
});
