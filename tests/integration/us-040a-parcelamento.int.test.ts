import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
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
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z"; // hoje = 10/11/2026; fechamento dia 25 => fatura aberta = nov
let fx: FamilyFixture;
let itau: AccountFixture;
let nubank: CardFixture;
let outro: FamilyFixture;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = async <T>(fn: () => Promise<T>, now = NOW): Promise<T> => {
  setDevClockOverride(now);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
let supermercado: string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  nubank = await makeCard(fx, {
    name: "Nubank",
    owner: "Mariana",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
  supermercado = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } })
  ).id;
});

const buy = (
  as: ReturnType<typeof lucas>,
  body: Record<string, unknown> = {},
  o: { now?: string; key?: string } = {},
) =>
  at(
    () =>
      call(
        as,
        "POST",
        "/api/v1/transactions",
        {
          type: "EXPENSE",
          cardId: nubank.id,
          categoryId: supermercado,
          description: "Notebook",
          amountInCents: 250000,
          installments: 10,
          ...body,
        },
        o.key ? { idempotencyKey: o.key } : {},
      ),
    o.now,
  );
const invoice = (ref: string, now = NOW) =>
  at(() => call(lucas(), "GET", `/api/v1/cards/${nubank.id}/invoices/${ref}`), now);
const cardsList = () => at(() => call(lucas(), "GET", "/api/v1/cards"));
const parcels = (planId: string) =>
  db.transaction.findMany({
    where: { installmentPlanId: planId },
    orderBy: { installmentNo: "asc" },
    include: { invoice: true },
  });

describe("US-040a: gera uma parcela por fatura", () => {
  it("250000 em 10x => 10 linhas, faturas 2026-11..2027-08, plano e limite", async () => {
    const res = await buy(lucas());
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({
      amountInCents: 25000,
      occurredOn: "2026-11-10",
      competenceOn: "2026-11-25",
      installment: { no: 1, count: 10 },
      invoice: { ref: "2026-11" },
    });
    expect(res.body.card).toEqual({ id: nubank.id, usedInCents: 250000, availableInCents: 250000 });
    const plan = res.body.plan;
    expect(plan).toMatchObject({
      description: "Notebook",
      count: 10,
      totalInCents: 250000,
      currentTotalInCents: 250000,
      activeCount: 10,
      purchaseOn: "2026-11-10",
      canDelete: true,
      deleted: false,
    });
    expect(plan.installments).toHaveLength(10);
    expect(plan.installments.map((p: { invoice: { ref: string } }) => p.invoice.ref)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ]);
    expect(plan.installments[0].invoice).toMatchObject({ status: "OPEN", isFuture: false });
    expect(plan.installments[1].invoice).toMatchObject({ status: "OPEN", isFuture: true });
    const rows = await parcels(plan.id);
    expect(rows).toHaveLength(10);
    expect(rows[9]).toMatchObject({ installmentNo: 10, installmentCount: 10 });
    expect(rows[9]?.occurredOn.toISOString().slice(0, 10)).toBe("2027-08-10");
    expect(rows[9]?.competenceOn.toISOString().slice(0, 10)).toBe("2027-08-25");
    // cada parcela com revisão CREATE
    expect(
      await db.transactionRevision.count({ where: { familyId: fx.family.id, action: "CREATE" } }),
    ).toBeGreaterThanOrEqual(10);
    // faturas: Notebook 1/10, 2/10 e 10/10
    const nov = (await invoice("2026-11")).body.invoice;
    expect(nov.purchases).toHaveLength(1);
    expect(nov.purchases[0]).toMatchObject({
      description: "Notebook",
      amountInCents: 25000,
      installment: { no: 1, count: 10 },
    });
    expect(nov).toMatchObject({
      isFuture: false,
      futureInstallmentsInCents: 225000,
      nextRef: "2026-12",
    });
    const dez = (await invoice("2026-12")).body.invoice;
    expect(dez).toMatchObject({
      totalInCents: 25000,
      isFuture: true,
      status: "OPEN",
      canPay: false,
      previousRef: "2026-11",
      futureInstallmentsInCents: 200000,
    });
    expect(dez.purchases[0].installment).toEqual({ planId: plan.id, no: 2, count: 10 });
    const ago = (await invoice("2027-08")).body.invoice;
    expect(ago.purchases[0].installment).toMatchObject({ no: 10, count: 10 });
    expect(ago).toMatchObject({ nextRef: null, futureInstallmentsInCents: 0 });
    const cards = await cardsList();
    expect(cards.body.items[0].installmentsFutureInCents).toBe(225000);
  });

  it("centavos na primeira parcela: 100001 em 3x => [33335, 33333, 33333]", async () => {
    const res = await buy(lucas(), { amountInCents: 100001, installments: 3 });
    expect(res.status).toBe(201);
    const rows = await parcels(res.body.plan.id);
    expect(rows.map((r) => Number(r.amountInCents))).toEqual([33335, 33333, 33333]);
    expect(res.body.plan.totalInCents).toBe(100001);
  });

  it("depois do fechamento (28/11): 1ª na fatura de dezembro; parcela 2 em janeiro", async () => {
    const res = await buy(
      lucas(),
      { installments: 3, amountInCents: 90000 },
      { now: "2026-11-28T15:00:00Z" },
    );
    expect(res.status).toBe(201);
    const rows = await parcels(res.body.plan.id);
    expect(rows.map((r) => r.invoice?.referenceMonth)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(rows[0]?.competenceOn.toISOString().slice(0, 10)).toBe("2026-12-25");
    expect(rows[1]?.occurredOn.toISOString().slice(0, 10)).toBe("2026-12-28");
  });

  it("fim do mês: 31/01 => datas 31/01, 28/02, 31/03 e faturas consecutivas (curso)", async () => {
    const res = await buy(
      lucas(),
      { installments: 3, amountInCents: 180000, description: "Curso" },
      { now: "2027-01-31T15:00:00Z" },
    );
    const rows = await parcels(res.body.plan.id);
    expect(rows.map((r) => r.occurredOn.toISOString().slice(0, 10))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    expect(rows.map((r) => r.invoice?.referenceMonth)).toEqual(["2027-02", "2027-03", "2027-04"]);
  });

  it("fechamento 28 e compra 31/01: uma parcela por fatura (ADR-020)", async () => {
    const c28 = await makeCard(fx, {
      name: "C28",
      owner: "Lucas",
      limitInCents: 500000,
      closingDay: 28,
      dueDay: 10,
    });
    const res = await buy(
      lucas(),
      { cardId: c28.id, installments: 3, amountInCents: 270000 },
      { now: "2027-01-31T15:00:00Z" },
    );
    const rows = await parcels(res.body.plan.id);
    expect(rows.map((r) => r.invoice?.referenceMonth)).toEqual(["2027-02", "2027-03", "2027-04"]);
  });
});

describe("US-040a: limite", () => {
  it("o total consome o limite e pagar a fatura de novembro libera só a parcela dela", async () => {
    await buy(lucas());
    const cards = await cardsList();
    expect(cards.body.items[0]).toMatchObject({ usedInCents: 250000, availableInCents: 250000 });
    // vence 05/12 (fatura nov fecha 25/11): paga em 26/11
    const pay = await at(
      () =>
        call(mariana(), "POST", `/api/v1/cards/${nubank.id}/invoices/2026-11/pay`, {
          accountId: itau.id,
          expectedTotalInCents: 25000,
        }),
      "2026-11-26T15:00:00Z",
    );
    expect(pay.status).toBe(201);
    const after = await cardsList();
    expect(after.body.items[0]).toMatchObject({ usedInCents: 225000, availableInCents: 275000 });
  });

  it("total acima do limite: a API aceita (disponível negativo)", async () => {
    const res = await buy(lucas(), { amountInCents: 600000, installments: 6 });
    expect(res.status).toBe(201);
    expect(res.body.card).toEqual({
      id: nubank.id,
      usedInCents: 600000,
      availableInCents: -100000,
    });
  });

  it("invariante: usedInCents = Σ faturas não pagas, futuras incluídas", async () => {
    await buy(lucas());
    await buy(lucas(), { amountInCents: 12345, installments: 2, description: "Outra" });
    const refs = [
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ];
    let sum = 0;
    for (const r of refs) {
      const inv = await invoice(r);
      sum += inv.body.invoice.totalInCents as number;
    }
    const cards = await cardsList();
    expect(cards.body.items[0].usedInCents).toBe(sum);
  });
});

describe("US-040a: à vista e 1x intactos; validações", () => {
  it("installments 1 (ou ausente) => sem plano, installment null", async () => {
    const a = await buy(lucas(), { installments: 1, amountInCents: 30000 });
    expect(a.status).toBe(201);
    expect(a.body.plan).toBeUndefined();
    expect(a.body.transaction.installment).toBeNull();
    expect(a.body.transaction.competenceOn).toBe(a.body.transaction.occurredOn);
    const { installments: _i, ...semCampo } = {
      type: "EXPENSE",
      cardId: nubank.id,
      categoryId: supermercado,
      amountInCents: 1000,
      installments: 1,
    };
    const b = await at(() => call(lucas(), "POST", "/api/v1/transactions", semCampo));
    expect(b.status).toBe(201);
    expect(await db.installmentPlan.count()).toBe(0);
  });

  it.each([[25], [0], [1.5], ["x"]])(
    "installments %s => 400 'Escolha de 1 a 24 parcelas'",
    async (v) => {
      const res = await buy(lucas(), { installments: v });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("Escolha de 1 a 24 parcelas");
    },
  );

  it("installments com conta => 400 'Parcelas só valem para compra no cartão'", async () => {
    const res = await at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: itau.id,
        categoryId: supermercado,
        amountInCents: 10000,
        installments: 3,
      }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("Parcelas só valem para compra no cartão");
  });

  it("receita com installments => 400 (strict)", async () => {
    const cat = (
      await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, kind: "INCOME" } })
    ).id;
    const res = await at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: itau.id,
        categoryId: cat,
        amountInCents: 10000,
        installments: 3,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("total 2 em 3x => 422 INSTALLMENT_TOTAL_TOO_SMALL; nada gravado", async () => {
    const res = await buy(lucas(), { amountInCents: 2, installments: 3 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSTALLMENT_TOTAL_TOO_SMALL");
    expect(await db.installmentPlan.count()).toBe(0);
  });

  it("dividir parcelado ainda indisponível => 422 INSTALLMENT_SPLIT_UNAVAILABLE", async () => {
    const res = await buy(lucas(), { isSharedExpense: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSTALLMENT_SPLIT_UNAVAILABLE");
    expect(await db.installmentPlan.count()).toBe(0);
  });

  it("data futura => 422 FUTURE_DATE_NOT_ALLOWED", async () => {
    const res = await buy(lucas(), { occurredOn: "2026-11-11" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
  });

  it("campos de servidor são rejeitados (strict)", async () => {
    for (const extra of [
      { competenceOn: "2026-11-25" },
      { installmentPlanId: randomUUID() },
      { invoiceId: randomUUID() },
    ]) {
      expect((await buy(lucas(), extra)).status).toBe(400);
    }
  });

  it("defaults informa installmentsAvailable false", async () => {
    const d = await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(d.body.split.installmentsAvailable).toBe(false);
  });
});

describe("US-040a: idempotência, isolamento, atomicidade, concorrência", () => {
  it("duplo clique (mesma chave): 1 plano e 10 parcelas, Idempotent-Replay", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([buy(lucas(), {}, { key }), buy(lucas(), {}, { key })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a, b].some((r) => r.headers.get("Idempotent-Replay") === "true")).toBe(true);
    expect(await db.installmentPlan.count()).toBe(1);
    expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(10);
  });

  it("mesma chave com corpo diferente => 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = randomUUID();
    await buy(lucas(), {}, { key });
    const res = await buy(lucas(), { installments: 5 }, { key });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("cartão de outra família => 422 INVALID_REFERENCE; plano de outra família => 404", async () => {
    outro = await makeFamily({
      name: "Outra",
      members: [{ email: "z@exemplo.com", name: "Zé", role: "ADMIN" }],
    });
    const card2 = await makeCard(outro, {
      name: "Cartão Z",
      owner: "Zé",
      closingDay: 10,
      dueDay: 20,
    });
    const res = await buy(lucas(), { cardId: card2.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
    const mine = await buy(lucas());
    const spy = await at(() =>
      call(outro.byName.Zé?.as ?? null, "GET", `/api/v1/installment-plans/${mine.body.plan.id}`),
    );
    expect(spy.status).toBe(404);
    const ok = await at(() =>
      call(lucas(), "GET", `/api/v1/installment-plans/${mine.body.plan.id}`),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.plan.installments).toHaveLength(10);
  });

  it("atomicidade: falha na 7ª revisão => nada gravado (plano, parcelas, faturas)", async () => {
    let n = 0;
    const real = ledger.recordRevision;
    vi.spyOn(ledger, "recordRevision").mockImplementation(async (...args) => {
      if (++n === 7) throw new Error("falha injetada");
      return real(...args);
    });
    const res = await buy(lucas());
    expect(res.status).toBe(500);
    expect(await db.installmentPlan.count()).toBe(0);
    expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(0);
    expect(await db.cardInvoice.count()).toBe(0);
  });

  it("fatura paga no intervalo => 422 INVOICE_ALREADY_PAID e nada gravado", async () => {
    // compra retroativa (01/09): 2ª parcela cai em outubro (paga)
    const inv = await makeInvoice(fx, nubank, "2026-10");
    await makeCardPurchase(fx, { card: nubank, amountInCents: 1000, occurredOn: "2026-10-05" });
    await makeInvoicePayment(fx, {
      card: nubank,
      invoice: inv,
      account: itau,
      amountInCents: 1000,
      paidOn: "2026-10-30",
    });
    const res = await buy(lucas(), { installments: 3, occurredOn: "2026-09-20" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_ALREADY_PAID");
    expect(res.body.error.details?.ref ?? "").toBe("2026-10");
    expect(await db.installmentPlan.count()).toBe(0);
  });

  it("duas compras de 24x simultâneas no mesmo cartão: ambas 201, sem deadlock", async () => {
    const [a, b] = await Promise.all([
      buy(lucas(), { installments: 24, amountInCents: 240000, description: "Compra A" }),
      buy(mariana(), { installments: 24, amountInCents: 480000, description: "Compra B" }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(48);
  });

  it("compra × arquivar o cartão: nunca fica cartão arquivado com parcela futura", async () => {
    const [buyRes, arch] = await Promise.all([
      buy(lucas()),
      at(() => call(mariana(), "POST", `/api/v1/cards/${nubank.id}/archive`, { version: 1 })),
    ]);
    const card = await db.creditCard.findUniqueOrThrow({ where: { id: nubank.id } });
    const planCount = await db.installmentPlan.count();
    if (card.archivedAt) expect(planCount === 0 || buyRes.status !== 201).toBe(true);
    else expect(arch.status).not.toBe(200);
  });

  it("parcelas 2..N não aparecem em recent da Home nem em defaults", async () => {
    await buy(lucas());
    const home = await at(() => call(lucas(), "GET", "/api/v1/home"));
    const recent = home.body.recent as Array<{ occurredOn: string }>;
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.every((r) => r.occurredOn <= "2026-11-10")).toBe(true);
  });
});

describe("US-040a: arquivar cartão com parcelas futuras (SDD-012 §4.1)", () => {
  it("CARD_HAS_FUTURE_INSTALLMENTS enquanto houver parcela ativa em fatura futura", async () => {
    const res0 = await buy(lucas(), { installments: 3, amountInCents: 30000 });
    // com a fatura aberta vazia (parcela 1 removida por SQL: a US-041 ainda não existe), só as futuras bloqueiam
    await db.$executeRaw`UPDATE transactions SET "deletedAt" = now(), "deletedByMemberId" = ${mid("Lucas")}::uuid, "deletionReason" = 'DELETED'
      WHERE "installmentPlanId" = ${res0.body.plan.id}::uuid AND "installmentNo" = 1`;
    const res = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${nubank.id}/archive`, { version: 1 }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CARD_HAS_FUTURE_INSTALLMENTS");
    await db.$executeRaw`UPDATE transactions SET "deletedAt" = now(), "deletedByMemberId" = ${mid("Lucas")}::uuid, "deletionReason" = 'DELETED'
      WHERE "installmentPlanId" = ${res0.body.plan.id}::uuid AND "installmentNo" > 1`;
    const ok = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${nubank.id}/archive`, { version: 1 }),
    );
    expect(ok.status).toBe(200);
  });
});

describe("US-040a: parcela é somente leitura até a US-041", () => {
  it("PATCH, delete e restore em parcela => 422 INSTALLMENT_NOT_EDITABLE", async () => {
    const res = await buy(lucas());
    const id = res.body.transaction.id;
    for (const [m, p, b] of [
      ["PATCH", `/api/v1/transactions/${id}`, { version: 1, note: "x" }],
      ["POST", `/api/v1/transactions/${id}/delete`, { version: 1 }],
      ["POST", `/api/v1/transactions/${id}/restore`, { version: 1 }],
    ] as const) {
      const r = await at(() => call(lucas(), m, p, b));
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("INSTALLMENT_NOT_EDITABLE");
    }
  });
});
