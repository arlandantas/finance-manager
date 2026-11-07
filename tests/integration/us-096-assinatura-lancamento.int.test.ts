import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import { setDevClockOverride } from "@/lib/clock";
import {
  ensureSubscriptionCharges,
  ensureSubscriptionChargesStandalone,
} from "@/modules/assinaturas/charges";
import { cardUsage } from "@/modules/cartoes/queries";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

// US-096 (ADR-036, spec 12): ACs 2-6 e as restrições do banco. Asserções sempre escopadas por família.
const db = testDb();
const NOW = "2026-11-20T15:00:00Z"; // hoje = 20/11/2026
let fx: FamilyFixture;
let card: CardFixture;
let account: AccountFixture;
let lazer: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  account = await makeAccount(fx, {
    name: "Itaú",
    owner: "Mariana",
    openingBalanceInCents: 900000,
  });
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  lazer = (
    await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer e restaurantes" },
    })
  ).id;
});

const at = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
  setDevClockOverride(iso);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
const ctxAt = (iso: string): RequestContext =>
  ({
    familyId: fx.family.id,
    memberId: mid("Mariana"),
    role: "ADMIN",
    clock: { now: () => new Date(iso) },
  }) as unknown as RequestContext;

const create = (body: Record<string, unknown> = {}, as = mariana()) =>
  call(as, "POST", "/api/v1/subscriptions", {
    cardId: card.id,
    description: "Netflix",
    amountInCents: 3990,
    categoryId: lazer,
    dayOfMonth: 10,
    end: { type: "NONE" },
    ...body,
  });
const list = (iso: string, q = "") =>
  at(iso, () => call(mariana(), "GET", `/api/v1/subscriptions${q}`));
const purchases = (description = "Netflix") =>
  db.transaction.findMany({
    where: { familyId: fx.family.id, origin: "SUBSCRIPTION", description },
    include: { invoice: true },
    orderBy: { occurredOn: "asc" },
  });
const charges = (subscriptionId: string) =>
  db.subscriptionCharge.findMany({
    where: { familyId: fx.family.id, subscriptionId },
    orderBy: { chargeMonth: "asc" },
  });

describe("US-096 cadastro", () => {
  it("cria com primeira cobrança não retroativa e valor vigente", async () => {
    const r = await create();
    expect(r.status).toBe(201);
    const s = r.body.subscription;
    expect(s).toMatchObject({
      description: "Netflix",
      currentAmountInCents: 3990,
      firstChargeOn: "2026-12-10",
      nextChargeOn: "2026-12-10",
      endMonth: null,
      endedOn: null,
      version: 1,
      recentSkips: [],
      card: { id: card.id, archived: false },
    });
    expect(s.payer.id).toBe(mid("Mariana"));
    const today = await create({ description: "Spotify", dayOfMonth: 20 });
    expect(today.body.subscription.firstChargeOn).toBe("2026-11-20");
    const counted = await create({ description: "Cursos", end: { type: "COUNT", count: 3 } });
    expect(counted.body.subscription.endMonth).toBe("2027-02");
  });

  it("Idempotency-Key repetida não duplica", async () => {
    const key = crypto.randomUUID();
    const body = {
      cardId: card.id,
      description: "Netflix",
      amountInCents: 3990,
      categoryId: lazer,
      dayOfMonth: 10,
      end: { type: "NONE" },
    };
    const a = await call(mariana(), "POST", "/api/v1/subscriptions", body, { idempotencyKey: key });
    const b = await call(mariana(), "POST", "/api/v1/subscriptions", body, { idempotencyKey: key });
    expect(b.body.subscription.id).toBe(a.body.subscription.id);
    expect(await db.cardSubscription.count({ where: { familyId: fx.family.id } })).toBe(1);
  });

  it("Idempotency-Key concorrente: mesma chave => 1 assinatura; chaves diferentes => 2, sem deadlock", async () => {
    const body = {
      cardId: card.id,
      description: "Netflix",
      amountInCents: 3990,
      categoryId: lazer,
      dayOfMonth: 10,
      end: { type: "NONE" },
    };
    const key = crypto.randomUUID();
    const same = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(mariana(), "POST", "/api/v1/subscriptions", body, { idempotencyKey: key }),
      ),
    );
    expect(same.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect(same.some((r) => r.status === 201)).toBe(true);
    expect(await db.cardSubscription.count({ where: { familyId: fx.family.id } })).toBe(1);
    const diff = await Promise.all(
      Array.from({ length: 2 }, (_, i) =>
        call(mariana(), "POST", "/api/v1/subscriptions", { ...body, description: `Outra ${i}` }),
      ),
    );
    expect(diff.map((r) => r.status)).toEqual([201, 201]);
    expect(await db.cardSubscription.count({ where: { familyId: fx.family.id } })).toBe(3);
  });

  it("validações: strict, mês de início, categoria de receita", async () => {
    expect((await create({ familyId: "x" })).status).toBe(400);
    expect((await create({ dayOfMonth: 32 })).status).toBe(400);
    expect((await create({ amountInCents: 0 })).status).toBe(400);
    const past = await create({ startMonth: "2026-10" });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe("INVALID_START_MONTH");
    expect((await create({ startMonth: "2027-11" })).status).toBe(422);
    expect((await create({ startMonth: "2027-10" })).status).toBe(201);
    const salario = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, kind: "INCOME" },
    });
    const kind = await create({ categoryId: salario.id });
    expect(kind.status).toBe(422);
    expect(kind.body.error.code).toBe("CATEGORY_KIND_MISMATCH");
  });

  it("AC6: cartão de outra família ou arquivado => 422 INVALID_REFERENCE em cardId", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const foreign = await makeCard(other, { name: "Alheio" });
    const r = await create({ cardId: foreign.id });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("INVALID_REFERENCE");
    expect(r.body.error.details[0].path).toBe("cardId");
    await db.creditCard.update({ where: { id: card.id }, data: { archivedAt: new Date() } });
    const archived = await create();
    expect(archived.status).toBe(422);
    expect(archived.body.error.details[0].path).toBe("cardId");
    expect(await db.cardSubscription.count({ where: { familyId: fx.family.id } })).toBe(0);
  });

  it("AC6: pagador fora das regras do 'Só meu' => mesmo erro da compra no cartão", async () => {
    const sub = await create({ payerMemberId: mid("Mariana") }, lucas());
    const buy = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      cardId: card.id,
      categoryId: lazer,
      amountInCents: 1000,
      payerMemberId: mid("Mariana"),
    });
    expect(buy.status).toBe(403);
    expect(sub.status).toBe(buy.status);
    expect(sub.body.error.code).toBe(buy.body.error.code);
    expect((await create({ payerMemberId: mid("Lucas") }, lucas())).status).toBe(201);
    expect((await create({ payerMemberId: crypto.randomUUID() })).status).toBe(422);
  });

  it("isolamento: outra família não vê a assinatura", async () => {
    await create();
    const other = await makeFamily({ uniqueEmails: true });
    const r = await call(other.members[0]?.as ?? null, "GET", "/api/v1/subscriptions");
    expect(r.body.items).toEqual([]);
    expect((await list(NOW)).body.items).toHaveLength(1);
    expect((await list(NOW, "?status=ended")).body.items).toHaveLength(0);
  });
});

describe("US-096 lançamento preguiçoso", () => {
  it("AC2: antes do dia nada; no dia vira compra SUBSCRIPTION na fatura do ciclo", async () => {
    const { subscription } = (await create()).body;
    await list("2026-12-09T15:00:00Z");
    expect(await purchases()).toHaveLength(0);
    const r = await list("2026-12-10T15:00:00Z");
    expect(r.body.items[0].nextChargeOn).toBe("2027-01-10");
    const [p] = await purchases();
    expect(p).toMatchObject({ kind: "EXPENSE", direction: "DEBIT", cardId: card.id });
    expect(Number(p?.amountInCents)).toBe(3990);
    expect(p?.occurredOn.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(p?.invoice?.referenceMonth).toBe("2026-12"); // dia 10 <= fechamento 25
    expect(p?.authorMemberId).toBe(mid("Mariana"));
    expect(p?.payerMemberId).toBe(mid("Mariana"));
    expect(p?.isSharedExpense).toBe(false);
    const [c] = await charges(subscription.id);
    expect(c).toMatchObject({ status: "POSTED", transactionId: p?.id });
    const rev = await db.transactionRevision.findMany({ where: { transactionId: p?.id } });
    expect(rev).toHaveLength(1);
  });

  it("AC2: cobrança depois do fechamento cai na fatura do mês seguinte; Extrato filtra SUBSCRIPTION", async () => {
    await create({ description: "Spotify", dayOfMonth: 28 });
    await list("2026-12-28T15:00:00Z");
    const all = await purchases("Spotify"); // 28/11 (já vencida no cadastro) e 28/12
    expect(all.map((x) => x.invoice?.referenceMonth)).toEqual(["2026-12", "2027-01"]);
    const p = all[1];
    const ext = await at("2026-12-28T15:00:00Z", () =>
      call(mariana(), "GET", "/api/v1/transactions?origin=SUBSCRIPTION"),
    );
    expect(ext.status).toBe(200);
    expect(ext.body.items.map((t: { id: string }) => t.id)).toEqual([p?.id]);
  });

  it("AC3: 5 execuções concorrentes => uma compra; excluída no Extrato não recria", async () => {
    const { subscription } = (await create()).body;
    const iso = "2026-12-10T15:00:00Z";
    await Promise.all(
      Array.from({ length: 5 }, () =>
        db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)), { timeout: 30_000 }),
      ),
    );
    await Promise.all(
      Array.from({ length: 3 }, () => ensureSubscriptionChargesStandalone(ctxAt(iso), db as never)),
    );
    expect(await purchases()).toHaveLength(1);
    expect(await charges(subscription.id)).toHaveLength(1);
    const [p] = await purchases();
    const del = await at(iso, () =>
      call(mariana(), "POST", `/api/v1/transactions/${p?.id}/delete`, { version: 1 }),
    );
    expect(del.status).toBe(200);
    await list("2026-12-11T15:00:00Z");
    await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt("2026-12-11T15:00:00Z")));
    expect(await purchases()).toHaveLength(1); // a única continua excluída
    expect((await purchases())[0]?.deletedAt).not.toBeNull();
    expect(await charges(subscription.id)).toHaveLength(1);
  });

  it("AC3: concorrência com 2 assinaturas e 2 famílias: sem duplicar nem travar", async () => {
    await create({ description: "Netflix" });
    await create({ description: "Spotify", dayOfMonth: 10 });
    const other = await makeFamily({ uniqueEmails: true });
    const otherCard = await makeCard(other, { name: "Outro", closingDay: 25, dueDay: 5 });
    const otherCat = await db.category.findFirstOrThrow({
      where: { familyId: other.family.id, kind: "EXPENSE" },
    });
    const o = await call(other.members[0]?.as ?? null, "POST", "/api/v1/subscriptions", {
      cardId: otherCard.id,
      description: "Netflix",
      amountInCents: 5000,
      categoryId: otherCat.id,
      dayOfMonth: 10,
      end: { type: "NONE" },
    });
    expect(o.status).toBe(201);
    const iso = "2026-12-10T15:00:00Z";
    const ctxOther = {
      familyId: other.family.id,
      memberId: other.members[0]?.memberId as string,
      role: "ADMIN",
      clock: { now: () => new Date(iso) },
    } as unknown as RequestContext;
    const results = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)), { timeout: 30_000 }),
      ),
      ...Array.from({ length: 4 }, () =>
        db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxOther), { timeout: 30_000 }),
      ),
      ensureSubscriptionChargesStandalone(ctxAt(iso), db as never),
      ensureSubscriptionChargesStandalone(ctxOther, db as never),
    ]);
    expect(results.slice(0, 8).reduce((a, b) => (a as number) + (b as number), 0)).toBe(3);
    expect(await purchases("Netflix")).toHaveLength(1);
    expect(await purchases("Spotify")).toHaveLength(1);
    const theirs = await db.transaction.findMany({
      where: { familyId: other.family.id, origin: "SUBSCRIPTION" },
    });
    expect(theirs).toHaveLength(1);
    expect(
      await db.subscriptionCharge.count({ where: { familyId: other.family.id, status: "POSTED" } }),
    ).toBe(1);
  });

  it("AC3: reexecução no mesmo dia é no-op", async () => {
    await create();
    const iso = "2026-12-10T15:00:00Z";
    expect(await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)))).toBe(1);
    expect(await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)))).toBe(0);
  });

  it("AC4: fatura do ciclo paga => SKIPPED_INVOICE_PAID, sem compra, próxima avança, limite só do lançado", async () => {
    const { subscription } = (await create()).body;
    const inv = await makeInvoice(fx, card, "2026-12");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account,
      amountInCents: 100,
      paidOn: "2026-12-05",
    });
    const r = await list("2026-12-10T15:00:00Z");
    expect(await purchases()).toHaveLength(0);
    const [c] = await charges(subscription.id);
    expect(c).toMatchObject({ status: "SKIPPED_INVOICE_PAID", transactionId: null });
    expect(r.body.items[0].nextChargeOn).toBe("2027-01-10");
    expect(r.body.items[0].recentSkips).toEqual([{ month: "2026-12", reason: "INVOICE_PAID" }]);
    await list("2027-01-10T15:00:00Z");
    expect(await purchases()).toHaveLength(1);
    const used = await db.$transaction((tx) => cardUsage(tx, fx.family.id, [card.id]));
    expect(used.get(card.id)).toBe(3990); // fatura paga (dez) fora do uso; só janeiro lançado
  });

  it("cartão arquivado => SKIPPED_CARD_ARCHIVED e a série segue", async () => {
    const { subscription } = (await create()).body;
    await db.creditCard.update({ where: { id: card.id }, data: { archivedAt: new Date() } });
    const r = await list("2026-12-10T15:00:00Z");
    expect(await purchases()).toHaveLength(0);
    expect((await charges(subscription.id))[0]?.status).toBe("SKIPPED_CARD_ARCHIVED");
    expect(r.body.items[0].card.archived).toBe(true);
    expect(r.body.items[0].recentSkips[0].reason).toBe("CARD_ARCHIVED");
  });

  it("AC5: três meses sem abrir o app => três compras, cada uma na sua fatura", async () => {
    await create();
    await list("2027-02-15T15:00:00Z");
    const ps = await purchases();
    expect(ps.map((p) => p.occurredOn.toISOString().slice(0, 10))).toEqual([
      "2026-12-10",
      "2027-01-10",
      "2027-02-10",
    ]);
    expect(ps.map((p) => p.invoice?.referenceMonth)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(new Set(ps.map((p) => p.invoiceId)).size).toBe(3);
  });

  it("limite de 12 por chamada; o resto na seguinte", async () => {
    const { subscription } = (await create({ dayOfMonth: 1 })).body;
    const iso = "2028-03-05T15:00:00Z"; // 12/2026 .. 03/2028 = 16 cobranças vencidas
    expect(await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)))).toBe(12);
    expect(await charges(subscription.id)).toHaveLength(12);
    expect(await db.$transaction((tx) => ensureSubscriptionCharges(tx, ctxAt(iso)))).toBe(4);
    expect(await charges(subscription.id)).toHaveLength(16);
  });

  it("COUNT 2 encerra a série: nextChargeOn nulo e sem terceira cobrança", async () => {
    const { subscription } = (await create({ end: { type: "COUNT", count: 2 } })).body;
    const r = await list("2027-06-01T15:00:00Z");
    expect(await purchases()).toHaveLength(2);
    expect(r.body.items[0].nextChargeOn).toBeNull();
    expect(await charges(subscription.id)).toHaveLength(2);
  });

  it("dia 31 vence no último dia de fevereiro", async () => {
    await create({ dayOfMonth: 31 });
    await list("2027-02-28T15:00:00Z");
    const days = (await purchases()).map((p) => p.occurredOn.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("falha numa assinatura não quebra a leitura nem as outras", async () => {
    const a = (await create({ description: "Quebrada", dayOfMonth: 10 })).body.subscription;
    await create({ description: "Boa", dayOfMonth: 10 });
    await db.cardSubscriptionAmount.deleteMany({
      where: { familyId: fx.family.id, subscriptionId: a.id },
    });
    const r = await list("2026-12-10T15:00:00Z");
    expect(r.status).toBe(200);
    expect(await purchases("Boa")).toHaveLength(1);
    expect(await purchases("Quebrada")).toHaveLength(0);
  });
});

describe("US-096 restrições do banco", () => {
  const sub = async () => (await create()).body.subscription.id as string;

  it("CHECKs e únicos", async () => {
    const id = await sub();
    const base = { familyId: fx.family.id, subscriptionId: id, chargeOn: new Date("2026-12-10") };
    const month = new Date("2026-12-01");
    await expect(
      db.subscriptionCharge.create({
        data: { ...base, chargeMonth: month, status: "POSTED", transactionId: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.subscriptionCharge.create({
        data: { ...base, chargeMonth: month, status: "SKIPPED_INVOICE_PAID" },
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.subscriptionCharge.create({
        data: { ...base, chargeMonth: month, status: "SKIPPED_CARD_ARCHIVED" },
      }),
    ).rejects.toThrow();
    await expect(
      db.cardSubscriptionAmount.create({
        data: {
          familyId: fx.family.id,
          subscriptionId: id,
          fromMonth: month,
          amountInCents: 0n,
          authorMemberId: mid("Mariana"),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.cardSubscription.update({ where: { id }, data: { dayOfMonth: 32 } }),
    ).rejects.toThrow();
    await expect(
      db.cardSubscription.update({ where: { id }, data: { endedAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      db.cardSubscription.update({
        where: { id },
        data: {
          endedAt: new Date(),
          endedOn: new Date("2026-12-10"),
          endedByMemberId: mid("Lucas"),
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("FK composta por família: assinatura não aponta cartão de outra família", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const foreign = await makeCard(other, { name: "Alheio" });
    await expect(
      db.cardSubscription.create({
        data: {
          familyId: fx.family.id,
          cardId: foreign.id,
          description: "X",
          categoryId: lazer,
          payerMemberId: mid("Mariana"),
          dayOfMonth: 1,
          firstChargeOn: new Date("2026-12-01"),
          authorMemberId: mid("Mariana"),
        },
      }),
    ).rejects.toThrow();
  });
});
