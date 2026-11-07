import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import {
  buildSubmission,
  type DoorCtx,
  type DoorState,
  validateSubmission,
} from "@/modules/lancamento/door";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
} from "../support/factories";

// SDD-031 §8.2: a porta é só de tela; cada modo chama o MESMO serviço de hoje com o mesmo corpo.
const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let corrente: AccountFixture;
let moradia: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = () => fx.byName.Mariana?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  corrente = await makeAccount(fx, {
    name: "Corrente",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
  moradia = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Moradia" } })
  ).id;
});

const ctx = (): DoorCtx => ({
  today: "2026-10-12",
  me: mid(),
  splitAvailable: false,
  splitBlocked: false,
  flags: { incomePlanned: false },
});
const state = (o: Partial<DoorState>): DoorState => ({
  kind: "EXPENSE",
  when: "NOW",
  repeat: "NONE",
  cents: 8000,
  description: "Mercado",
  categoryId: moradia,
  source: `acc:${corrente.id}`,
  payerId: mid(),
  shared: false,
  sharedTouched: false,
  date: "",
  note: "",
  tags: [],
  installments: 1,
  paidBeforeApp: 0,
  paidAnchorOn: "",
  day: "10",
  startMonth: "2026-10",
  endKind: "NONE",
  endMonths: "",
  ...o,
});
const ROUTE = {
  TRANSACTION: "/api/v1/transactions",
  PLANNED: "/api/v1/planned-expenses",
  SERIES: "/api/v1/recurring-expenses",
  SUBSCRIPTION: "/api/v1/subscriptions",
} as const;

async function viaDoor(o: Partial<DoorState>, key = randomUUID()) {
  const v = validateSubmission(state(o), ctx());
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return withClock(NOW, () =>
    call(mariana(), "POST", ROUTE[v.submission.service], v.submission.input, {
      idempotencyKey: key,
    }),
  );
}
const manual = (service: keyof typeof ROUTE, body: Record<string, unknown>) =>
  withClock(NOW, () => call(mariana(), "POST", ROUTE[service], body));

const accountBalance = async () =>
  (await withClock(NOW, () => call(mariana(), "GET", "/api/v1/accounts"))).body.items.find(
    (a: { id: string }) => a.id === corrente.id,
  ).balanceInCents as number;
// o saldo de abertura da conta é uma linha do livro; só conta o que a porta lança
const ledgerCount = () => db.transaction.count({ where: { kind: { not: "OPENING" } } });
const payables = async () =>
  (await withClock(NOW, () => call(mariana(), "GET", "/api/v1/payables"))).body;

describe("US-090 paridade: a porta envia o mesmo corpo que a chamada manual", () => {
  it("NOW: mesmo status e mesmo DTO (menos ids e datas de criação)", async () => {
    const door = await viaDoor({});
    const hand = await manual("TRANSACTION", {
      type: "EXPENSE",
      accountId: corrente.id,
      categoryId: moradia,
      amountInCents: 8000,
      payerMemberId: mid(),
      description: "Mercado",
      isSharedExpense: false,
    });
    expect(door.status).toBe(201);
    expect(hand.status).toBe(201);
    const pick = (b: any) => ({ ...b.transaction, id: 0, createdAt: 0, updatedAt: 0 });
    expect(Object.keys(door.body).sort()).toEqual(Object.keys(hand.body).sort());
    expect(pick(door.body).amountInCents).toBe(pick(hand.body).amountInCents);
    expect(pick(door.body).description).toBe(pick(hand.body).description);
  });

  it("PLANNED e SERIES: mesmo status e mesma forma de resposta", async () => {
    const dp = await viaDoor({ when: "LATER", description: "Condomínio", date: "2026-10-20" });
    const hp = await manual("PLANNED", {
      paymentAccountId: corrente.id,
      description: "Condomínio",
      amountInCents: 8000,
      categoryId: moradia,
      responsibleMemberId: mid(),
      isSharedExpense: false,
      dueOn: "2026-10-20",
    });
    expect(dp.status).toBe(201);
    expect(hp.status).toBe(201);
    expect(Object.keys(dp.body.plannedExpense).sort()).toEqual(
      Object.keys(hp.body.plannedExpense).sort(),
    );
    const ds = await viaDoor({ when: "LATER", repeat: "MONTHLY", description: "Internet" });
    const hs = await manual("SERIES", {
      description: "Internet 2",
      amountInCents: 8000,
      categoryId: moradia,
      responsibleMemberId: mid(),
      isSharedExpense: false,
      paymentAccountId: corrente.id,
      dayOfMonth: 10,
      startMonth: "2026-10",
      end: { kind: "NONE" },
    });
    expect(ds.status).toBe(201);
    expect(hs.status).toBe(201);
    expect(ds.body.generatedCount).toBe(hs.body.generatedCount);
    expect(ds.body.generatedCount).toBe(12);
  });
});

describe("US-090 prever não muda o livro-caixa", () => {
  it("PLANNED e SERIES não alteram saldo nem lançamentos; aparecem em A pagar; NOW muda o saldo", async () => {
    const saldo0 = await accountBalance();
    const antes = await payables();
    await viaDoor({ when: "LATER", description: "Condomínio", date: "2026-10-20", cents: 65000 });
    expect(await accountBalance()).toBe(saldo0);
    expect(await ledgerCount()).toBe(0);
    const depois = await payables();
    expect(depois.totals.dueInCents - antes.totals.dueInCents).toBe(65000);
    expect(depois.groups.planned.map((p: { title: string }) => p.title)).toContain("Condomínio");

    await viaDoor({ when: "LATER", repeat: "MONTHLY", description: "Internet", cents: 12000 });
    expect(await accountBalance()).toBe(saldo0);
    expect(await ledgerCount()).toBe(0);
    expect(await db.plannedExpense.count({ where: { description: "Internet" } })).toBe(12);

    await viaDoor({ cents: 8000 });
    expect(await ledgerCount()).toBe(1);
    expect(await accountBalance()).toBe(saldo0 - 8000);
  });
});

describe("SEC-025/026/038 e 'Só meu'", () => {
  it("responsável de outro em 'Só meu' é recusado em PLANNED e SERIES e na transação, como hoje", async () => {
    const lucas = fx.byName.Lucas?.memberId as string;
    const base = { amountInCents: 8000, categoryId: moradia, isSharedExpense: false };
    const rp = await manual("PLANNED", {
      ...base,
      description: "Luz",
      paymentAccountId: corrente.id,
      responsibleMemberId: lucas,
    });
    expect(rp.status).toBeGreaterThanOrEqual(400);
    const rs = await manual("SERIES", {
      ...base,
      description: "Luz",
      paymentAccountId: corrente.id,
      responsibleMemberId: lucas,
      dayOfMonth: 5,
      startMonth: "2026-10",
      end: { kind: "NONE" },
    });
    expect(rs.status).toBeGreaterThanOrEqual(400);
    const rt = await manual("TRANSACTION", {
      type: "EXPENSE",
      accountId: corrente.id,
      categoryId: moradia,
      amountInCents: 8000,
      payerMemberId: lucas,
      isSharedExpense: false,
    });
    expect(rt.status).toBeGreaterThanOrEqual(400);
    // a porta nunca monta esse corpo: SEC-026 força o responsável = eu
    const sub = buildSubmission(state({ when: "LATER", payerId: lucas }), ctx());
    expect((sub.input as { responsibleMemberId: string }).responsibleMemberId).toBe(mid());
    expect((await viaDoor({ when: "LATER", payerId: lucas })).status).toBe(201);
  });
});

describe("US-090 idempotência por serviço (D-TL-U7-9)", () => {
  it("mesma chave + mesmo corpo repete a resposta nos três serviços", async () => {
    for (const o of [
      {},
      { when: "LATER" as const },
      { when: "LATER" as const, repeat: "MONTHLY" as const },
    ]) {
      const key = randomUUID();
      const a = await viaDoor(o, key);
      const b = await viaDoor(o, key);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(b.body).toEqual(a.body);
    }
    expect(await ledgerCount()).toBe(1);
  });

  it("mesma chave em outro caminho = IDEMPOTENCY_KEY_REUSED (por isso a chave é por serviço)", async () => {
    const key = randomUUID();
    expect((await viaDoor({}, key)).status).toBe(201);
    const r = await viaDoor({ when: "LATER" }, key);
    expect(r.status).toBe(422); // SDD-031 previa 409; o with-api devolve 422 com o mesmo código
    expect(r.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("US-090 datas", () => {
  it("PLANNED aceita vencimento futuro e passado; NOW recusa futura; SERIES com dia passado segue a série", async () => {
    expect((await viaDoor({ when: "LATER", date: "2026-12-30" })).status).toBe(201);
    expect((await viaDoor({ when: "LATER", date: "2026-09-01" })).status).toBe(201);
    const future = await manual("TRANSACTION", {
      type: "EXPENSE",
      accountId: corrente.id,
      categoryId: moradia,
      amountInCents: 8000,
      occurredOn: "2026-10-20",
    });
    expect(future.status).toBe(422);
    expect(future.body.error.message).toBe("Para contas futuras, use Despesa prevista");
    const s = await viaDoor({ when: "LATER", repeat: "MONTHLY", day: "3", startMonth: "2026-10" });
    expect(s.status).toBe(201);
    expect(s.body.generatedCount).toBe(12);
  });
});

describe("US-090 receita e cartão não têm 'prevista'", () => {
  it("planned-expenses rejeita `type` (.strict) e a porta não monta previsão de receita/cartão", async () => {
    const r = await manual("PLANNED", {
      type: "INCOME",
      description: "Salário",
      amountInCents: 100000,
      categoryId: moradia,
    });
    expect(r.status).toBe(400);
    const card = await makeCard(fx, { name: "Nubank Lucas" });
    const sub = buildSubmission(state({ when: "LATER", source: `card:${card.id}` }), ctx());
    expect(sub.input).not.toHaveProperty("cardId");
  });
});

describe("US-091 série pela porta", () => {
  it("sem conta de pagamento a validação do cliente recusa; com conta cria a série e 12 previstas", async () => {
    const v = validateSubmission(
      state({ when: "LATER", repeat: "MONTHLY", description: "Internet", source: "" }),
      ctx(),
    );
    expect(v).toMatchObject({ ok: false, errors: { source: "Séries exigem conta de pagamento" } });
    const r = await viaDoor({
      when: "LATER",
      repeat: "MONTHLY",
      description: "Internet",
      cents: 12000,
      day: "10",
    });
    expect(r.status).toBe(201);
    const series = await db.recurringExpense.findMany();
    expect(series).toHaveLength(1);
    expect(series[0]?.description).toBe("Internet");
    const pg = await payables();
    expect(
      pg.groups.planned.filter((p: { title: string }) => p.title === "Internet").length,
    ).toBeGreaterThanOrEqual(1);
  });
});
