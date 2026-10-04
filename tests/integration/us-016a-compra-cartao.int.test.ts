import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
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
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-15T15:00:00Z"; // hoje = 15/10/2026
let fx: FamilyFixture;
let itau: AccountFixture;
let nubank: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
// Relógio por teste: `withClock` encadeado em chamadas concorrentes deixa um relógio "preso"; aqui
// o valor volta sempre ao NOW padrão (seguro para Promise.all).
const at = async <T>(fn: () => Promise<T>, now = NOW): Promise<T> => {
  setDevClockOverride(now);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
let supermercado: string;
let lazer: string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  nubank = await makeCard(fx, {
    name: "Nubank Mariana",
    owner: "Mariana",
    limitInCents: 500000,
    closingDay: 25,
    dueDay: 5,
  });
  supermercado = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } })
  ).id;
  lazer = (
    await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer e restaurantes" },
    })
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
          amountInCents: 30000,
          ...body,
        },
        o.key ? { idempotencyKey: o.key } : {},
      ),
    o.now,
  );

describe("US-016a Compra no cartão com sucesso", () => {
  it("POST com cardId: sem account, saldos iguais, usado 30000, disponível 470000, autor = pagador = Lucas, revisão CREATE", async () => {
    const before = await accountBalances(db as never, fx.family.id);
    const res = await buy(lucas());
    expect(res.status).toBe(201);
    expect(res.body.account).toBeUndefined();
    expect(res.body.card).toEqual({ id: nubank.id, usedInCents: 30000, availableInCents: 470000 });
    expect(res.body.transaction).toMatchObject({
      type: "EXPENSE",
      account: null,
      card: { id: nubank.id, name: "Nubank Mariana" },
      occurredOn: "2026-10-15",
      author: { id: mid("Lucas") },
      payer: { id: mid("Lucas") },
      isSharedExpense: true,
    });
    expect(await accountBalances(db as never, fx.family.id)).toEqual(before);
    const row = await db.transaction.findUniqueOrThrow({ where: { id: res.body.transaction.id } });
    expect(row).toMatchObject({ accountId: null, cardId: nubank.id });
    expect(row.invoiceId).not.toBeNull();
    const revs = await db.transactionRevision.findMany({ where: { transactionId: row.id } });
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ action: "CREATE", revision: 1 });
  });

  it("a compra entra na fatura aberta: out/2026 fecha 25/10 e vence 05/11; GET /cards reflete", async () => {
    const res = await buy(lucas());
    expect(res.body.transaction.invoice).toEqual({
      ref: "2026-10",
      closingDate: "2026-10-25",
      dueDate: "2026-11-05",
    });
    const cards = await at(() => call(lucas(), "GET", "/api/v1/cards"));
    expect(cards.body.items[0]).toMatchObject({
      usedInCents: 30000,
      availableInCents: 470000,
      cycleLocked: true,
      openInvoice: { ref: "2026-10", status: "OPEN", totalInCents: 30000, purchasesCount: 1 },
    });
  });

  it.each([
    ["2026-10-25T15:00:00Z", undefined, "2026-10", "2026-10-25", "2026-11-05"], // dia do fechamento
    ["2026-10-26T15:00:00Z", undefined, "2026-11", "2026-11-25", "2026-12-05"], // depois do fechamento
    ["2026-12-26T15:00:00Z", undefined, "2027-01", "2027-01-25", "2027-02-05"], // fim de ano
    ["2026-10-28T15:00:00Z", "2026-10-20", "2026-10", "2026-10-25", "2026-11-05"], // retroativa
  ])("relógio %s, data %s => fatura %s", async (now, occurredOn, ref, closing, due) => {
    const res = await buy(lucas(), occurredOn ? { occurredOn } : {}, { now });
    expect(res.status).toBe(201);
    expect(res.body.transaction.invoice).toEqual({ ref, closingDate: closing, dueDate: due });
  });

  it("fuso: 2026-10-26T02:30:00Z ainda é 25/10 em São Paulo => out/2026 e a fatura segue ABERTA", async () => {
    const res = await buy(lucas(), {}, { now: "2026-10-26T02:30:00Z" });
    expect(res.body.transaction.occurredOn).toBe("2026-10-25");
    expect(res.body.transaction.invoice.ref).toBe("2026-10");
    const cards = await at(() => call(lucas(), "GET", "/api/v1/cards"), "2026-10-26T02:30:00Z");
    expect(cards.body.items[0].openInvoice).toMatchObject({ ref: "2026-10", status: "OPEN" });
  });

  it("em nome de outro membro: autor Lucas, pagador Mariana; pessoal fica fora do acerto", async () => {
    const other = await buy(lucas(), { amountInCents: 35000, payerMemberId: mid("Mariana") });
    expect(other.body.transaction).toMatchObject({
      author: { id: mid("Lucas") },
      payer: { id: mid("Mariana") },
    });
    const personal = await buy(lucas(), {
      amountInCents: 8000,
      categoryId: lazer,
      isSharedExpense: false,
    });
    expect(personal.body.transaction.isSharedExpense).toBe(false);
    const settlement = await at(() => call(lucas(), "GET", "/api/v1/settlement"));
    expect(settlement.body.totalSharedInCents).toBe(35000);
  });
});

describe("US-016a Acerto, totais e saldo", () => {
  it("compra compartilhada da Mariana (EXPENSE EQUAL) em 15/10 => Lucas deve 15000 a Mariana; igual ao lançamento por conta (regressão)", async () => {
    await buy(mariana(), { amountInCents: 30000, occurredOn: "2026-10-15" });
    const viaCard = await at(() => call(lucas(), "GET", "/api/v1/settlement"));
    expect(viaCard.body.suggestions[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      to: { name: "Mariana Silva" },
      amountInCents: 15000,
    });
    await resetDb();
    fx = await makeFamily();
    const itau2 = await makeAccount(fx, { name: "Itaú", openingBalanceInCents: 300000 });
    await makeTransaction(fx, {
      account: itau2,
      category: "Supermercado",
      amountInCents: 30000,
      occurredOn: "2026-10-15",
      author: "Mariana",
      payer: "Mariana",
    });
    const viaAccount = await at(() =>
      call(fx.byName.Lucas?.as ?? null, "GET", "/api/v1/settlement"),
    );
    expect(viaAccount.body.suggestions[0].amountInCents).toBe(
      viaCard.body.suggestions[0].amountInCents,
    );
    expect(viaAccount.body.totalSharedInCents).toBe(viaCard.body.totalSharedInCents);
  });

  it("entra nos totais do mês e na Home; Σ saldos não muda", async () => {
    const totalsBefore = await at(() =>
      call(lucas(), "GET", "/api/v1/transactions?period=2026-10"),
    );
    const homeBefore = await at(() => call(lucas(), "GET", "/api/v1/home"));
    await buy(lucas(), { amountInCents: 30000 });
    const totals = await at(() => call(lucas(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(totals.body.totals.expenseInCents).toBe(totalsBefore.body.totals.expenseInCents + 30000);
    const home = await at(() => call(lucas(), "GET", "/api/v1/home"));
    expect(home.body.monthSummary.expenseInCents).toBe(
      homeBefore.body.monthSummary.expenseInCents + 30000,
    );
    const lucasShare = home.body.monthSummary.byMember.find(
      (m: { member: { id: string } }) => m.member.id === mid("Lucas"),
    );
    expect(lucasShare.paidInCents).toBe(30000);
    expect(home.body.familyBalanceInCents).toBe(homeBefore.body.familyBalanceInCents);
    expect(home.body.familyBalanceInCents).toBe(300000);
  });

  it("accountBalances: compra no cartão não cria chave nula no mapa", async () => {
    await buy(lucas());
    const map = await accountBalances(db as never, fx.family.id);
    expect([...map.keys()]).toEqual([itau.id]);
    expect(map.get(itau.id)).toBe(300000);
  });
});

describe("US-016a Limite, validações e padrões", () => {
  it("acima do limite disponível: 201 com disponível negativo (D-PO-08)", async () => {
    await makeCardPurchase(fx, { card: nubank, amountInCents: 490000, occurredOn: "2026-10-10" });
    const res = await buy(lucas(), { amountInCents: 30000 });
    expect(res.status).toBe(201);
    expect(res.body.card).toMatchObject({ usedInCents: 520000, availableInCents: -20000 });
  });

  it("valor 0 => 400; data de amanhã => 422 'A data da compra não pode ser futura'; nada gravado", async () => {
    expect((await buy(lucas(), { amountInCents: 0 })).status).toBe(400);
    const res = await buy(lucas(), { occurredOn: "2026-10-16" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    expect(res.body.error.message).toBe("A data da compra não pode ser futura");
    expect(await db.transaction.count({ where: { cardId: nubank.id } })).toBe(0);
    // virada em SP: 2026-10-16T02:30Z ainda é 15/10, logo 15/10 é aceito e 16/10 não
    const edge = await buy(lucas(), { occurredOn: "2026-10-16" }, { now: "2026-10-16T02:30:00Z" });
    expect(edge.status).toBe(422);
    expect(
      (await buy(lucas(), { occurredOn: "2026-10-15" }, { now: "2026-10-16T02:30:00Z" })).status,
    ).toBe(201);
  });

  it("GET /defaults: cardId quando a última despesa foi no cartão; null quando foi em conta", async () => {
    const none = await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(none.body.cardId).toBeNull();
    await buy(lucas());
    const afterCard = await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(afterCard.body.cardId).toBe(nubank.id);
    await at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: itau.id,
        categoryId: supermercado,
        amountInCents: 1000,
      }),
    );
    const afterAccount = await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(afterAccount.body.cardId).toBeNull();
    expect(afterAccount.body.accountId).toBe(itau.id);
  });

  it("receita com cardId => 400 (.strict)", async () => {
    const incomeCat = (
      await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Salário" } })
    ).id;
    const res = await at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: itau.id,
        cardId: nubank.id,
        categoryId: incomeCat,
        amountInCents: 1000,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("referências: cartão de outra família => 422; conta e cartão => 400; nenhum => 400", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const alien = await makeCard(other, { name: "Visa Souza" });
    const bad = await buy(lucas(), { cardId: alien.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("INVALID_REFERENCE");
    const both = await buy(lucas(), { accountId: itau.id });
    expect(both.status).toBe(400);
    expect(both.body.error.message).toBe("Informe a conta ou o cartão, não os dois");
    const neither = await at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        categoryId: supermercado,
        amountInCents: 1000,
      }),
    );
    expect(neither.status).toBe(400);
    expect(neither.body.error.message).toBe("Escolha uma conta ou um cartão");
  });
});

describe("US-016a Idempotência, extrato, atomicidade e concorrência", () => {
  it("duplo clique (mesma chave): 1 compra, usado aumenta 1x, 2ª resposta Idempotent-Replay", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([buy(lucas(), {}, { key }), buy(lucas(), {}, { key })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a, b].some((r) => r.headers.get("Idempotent-Replay") === "true")).toBe(true);
    expect(await db.transaction.count({ where: { cardId: nubank.id } })).toBe(1);
    const cards = await at(() => call(lucas(), "GET", "/api/v1/cards"));
    expect(cards.body.items[0].usedInCents).toBe(30000);
  });

  it("extrato: item com account null, card e invoice.ref; filtro por conta não traz a compra", async () => {
    await buy(lucas());
    const res = await at(() => call(lucas(), "GET", "/api/v1/transactions?period=2026-10"));
    const item = res.body.items.find((i: { card: unknown }) => i.card);
    expect(item).toMatchObject({
      account: null,
      card: { name: "Nubank Mariana" },
      invoice: { ref: "2026-10" },
    });
    const byAccount = await at(() =>
      call(lucas(), "GET", `/api/v1/transactions?period=2026-10&accountId=${itau.id}`),
    );
    expect(byAccount.body.items.some((i: { card: unknown }) => i.card)).toBe(false);
  });

  it("banco: EXPENSE com conta E cartão, ou sem nenhum, viola tx_kind_shape_chk", async () => {
    const inv = await db.cardInvoice.create({
      data: {
        familyId: fx.family.id,
        cardId: nubank.id,
        referenceMonth: "2026-10",
        closingDate: new Date("2026-10-25T00:00:00Z"),
        dueDate: new Date("2026-11-05T00:00:00Z"),
      },
    });
    const base = {
      familyId: fx.family.id,
      kind: "EXPENSE" as const,
      direction: "DEBIT" as const,
      amountInCents: 100n,
      occurredOn: new Date("2026-10-10T00:00:00Z"),
      categoryId: supermercado,
      description: "x",
      payerMemberId: mid("Lucas"),
      authorMemberId: mid("Lucas"),
    };
    await expect(
      db.transaction.create({
        data: { ...base, accountId: itau.id, cardId: nubank.id, invoiceId: inv.id },
      }),
    ).rejects.toThrow(/tx_kind_shape_chk/);
    await expect(db.transaction.create({ data: { ...base } })).rejects.toThrow(/tx_kind_shape_chk/);
    await expect(
      db.transaction.create({ data: { ...base, accountId: itau.id } }),
    ).resolves.toBeDefined();
    await expect(
      db.transaction.create({ data: { ...base, cardId: nubank.id, invoiceId: inv.id } }),
    ).resolves.toBeDefined();
  });

  it("atomicidade: falha na revisão => nem compra nem fatura persistem", async () => {
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    const res = await buy(lucas());
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.transaction.count({ where: { cardId: nubank.id } })).toBe(0);
    expect(await db.cardInvoice.count()).toBe(0);
  });

  it("10 compras simultâneas no mesmo ciclo => 1 fatura e total = soma", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => buy(lucas(), { amountInCents: 1000 + i })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await db.cardInvoice.count({ where: { cardId: nubank.id } })).toBe(1);
    const sum = Array.from({ length: 10 }, (_, i) => 1000 + i).reduce((a, b) => a + b, 0);
    const cards = await at(() => call(lucas(), "GET", "/api/v1/cards"));
    expect(cards.body.items[0].usedInCents).toBe(sum);
    expect(cards.body.items[0].openInvoice.totalInCents).toBe(sum);
  });

  it("corrida PATCH do ciclo x 1ª compra: nunca fatura com datas do ciclo antigo e cartão novo", async () => {
    const [patch, purchase] = await Promise.all([
      call(mariana(), "PATCH", `/api/v1/cards/${nubank.id}`, {
        version: 1,
        closingDay: 20,
        dueDay: 10,
      }),
      buy(lucas()),
    ]);
    expect(purchase.status).toBe(201);
    const card = await db.creditCard.findUniqueOrThrow({ where: { id: nubank.id } });
    const invoice = await db.cardInvoice.findFirstOrThrow({ where: { cardId: nubank.id } });
    const closingDay = Number(invoice.closingDate.toISOString().slice(8, 10));
    expect(closingDay).toBe(card.closingDay);
    if (patch.status === 422) expect(patch.body.error.code).toBe("CYCLE_LOCKED");
  });
});

describe("US-016a/US-015 Ciclo travado após a primeira compra", () => {
  it("PATCH de dia => 422 CYCLE_LOCKED com a mensagem; nome/limite seguem 200; trava persiste após excluir a compra", async () => {
    const res = await buy(lucas());
    const blocked = await call(mariana(), "PATCH", `/api/v1/cards/${nubank.id}`, {
      version: 1,
      closingDay: 20,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("CYCLE_LOCKED");
    expect(blocked.body.error.message).toBe(
      "Os dias de fechamento e vencimento não podem ser alterados porque já há compras neste cartão",
    );
    expect(
      (
        await call(mariana(), "PATCH", `/api/v1/cards/${nubank.id}`, {
          version: 1,
          name: "Roxinho",
          limitInCents: 600000,
        })
      ).status,
    ).toBe(200);
    await call(lucas(), "POST", `/api/v1/transactions/${res.body.transaction.id}/delete`, {
      version: 1,
    });
    const still = await call(mariana(), "PATCH", `/api/v1/cards/${nubank.id}`, {
      version: 2,
      dueDay: 9,
    });
    expect(still.status).toBe(422);
    const cards = await call(mariana(), "GET", "/api/v1/cards");
    expect(cards.body.items[0].cycleLocked).toBe(true);
  });

  it("limite abaixo do usado é aceito (disponível negativo)", async () => {
    await buy(lucas(), { amountInCents: 300000 });
    const res = await call(mariana(), "PATCH", `/api/v1/cards/${nubank.id}`, {
      version: 1,
      limitInCents: 100000,
    });
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({ usedInCents: 300000, availableInCents: -200000 });
  });
});

describe("Relógio de teste (/api/dev/clock)", () => {
  it("404 com o login de teste desligado (padrão da integração)", async () => {
    const res = await call(null, "POST", "/api/dev/clock", { now: "2026-10-15T15:00:00Z" });
    expect(res.status).toBe(404);
  });

  it("403 fora de localhost; 200 em localhost e o relógio fica fixo até ser restaurado", async () => {
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    try {
      const alien = await call(
        null,
        "POST",
        "/api/dev/clock",
        { now: "2026-10-15T15:00:00Z" },
        { host: "exemplo.com" },
      );
      expect(alien.status).toBe(403);
      const ok = await call(null, "POST", "/api/dev/clock", { now: "2026-12-26T15:00:00Z" });
      expect(ok.status).toBe(200);
      const { getClock } = await import("@/lib/clock");
      expect(getClock().now().toISOString()).toBe("2026-12-26T15:00:00.000Z");
      expect((await call(null, "POST", "/api/dev/clock", { now: "lixo" })).status).toBe(400);
    } finally {
      await call(null, "POST", "/api/dev/clock", { now: null });
      vi.unstubAllEnvs();
    }
    const { getClock } = await import("@/lib/clock");
    expect(getClock().now().toISOString()).not.toBe("2026-12-26T15:00:00.000Z");
    setDevClockOverride(NOW);
  });
});
