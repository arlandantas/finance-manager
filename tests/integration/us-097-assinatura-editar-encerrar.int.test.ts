import { beforeEach, describe, expect, it, vi } from "vitest";
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

// US-097 (ADR-036, spec 12): corrigir a cobrança do mês, reajustar e encerrar a assinatura.
const db = testDb();
const SIGNUP = "2026-10-05T15:00:00Z"; // cria a assinatura (cobrança dia 10 => 1ª em 10/10)
const NOV = "2026-11-20T15:00:00Z"; // outubro e novembro já lançados
const DEC = "2026-12-11T15:00:00Z"; // dezembro lançado
let fx: FamilyFixture;
let card: CardFixture;
let itau: AccountFixture;
let lazer: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

const at = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
  setDevClockOverride(iso);
  try {
    return await fn();
  } finally {
    setDevClockOverride(SIGNUP);
  }
};

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(SIGNUP);
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  lazer = (
    await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer e restaurantes" },
    })
  ).id;
});

const create = async (over: Record<string, unknown> = {}) => {
  const r = await call(mariana(), "POST", "/api/v1/subscriptions", {
    cardId: card.id,
    description: "Netflix",
    amountInCents: 5590,
    categoryId: lazer,
    dayOfMonth: 10,
    end: { type: "NONE" },
    ...over,
  });
  expect(r.status).toBe(201);
  return r.body.subscription as { id: string; version: number };
};
const patch = (id: string, body: Record<string, unknown>, as = mariana(), key?: string) =>
  call(as, "PATCH", `/api/v1/subscriptions/${id}`, body, key ? { idempotencyKey: key } : {});
const end = (id: string, version: number, as = mariana(), key?: string) =>
  call(
    as,
    "POST",
    `/api/v1/subscriptions/${id}/end`,
    { version },
    key ? { idempotencyKey: key } : {},
  );
const open = (iso: string) => at(iso, () => call(mariana(), "GET", "/api/v1/transactions"));
const charges = (subId: string) =>
  db.subscriptionCharge.findMany({
    where: { subscriptionId: subId },
    orderBy: { chargeMonth: "asc" },
    include: { transaction: true },
  });
const cents = (c: { transaction: { amountInCents: bigint } | null }) =>
  Number(c.transaction?.amountInCents);

describe("US-097 AC1-2: corrigir a cobrança do mês", () => {
  it("55,90 -> 59,90 só em novembro: outubro e dezembro ficam, isAmended e selo", async () => {
    const sub = await create();
    await open(NOV);
    const nov = (await charges(sub.id))[1];
    const res = await call(mariana(), "PATCH", `/api/v1/transactions/${nov?.transactionId}`, {
      version: 1,
      amountInCents: 5990,
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction.isSubscriptionAmended).toBe(true);
    await open(DEC);
    const rows = await charges(sub.id);
    expect(rows.map(cents)).toEqual([5590, 5990, 5590]);
    expect(rows.map((r) => r.isAmended)).toEqual([false, true, false]);
    const detail = await call(mariana(), "GET", `/api/v1/transactions/${nov?.transactionId}`);
    expect(detail.body.transaction).toMatchObject({
      isSubscription: true,
      isSubscriptionAmended: true,
    });
    const dec = (await charges(sub.id))[2];
    const other = await call(mariana(), "GET", `/api/v1/transactions/${dec?.transactionId}`);
    expect(other.body.transaction.isSubscriptionAmended).toBe(false);
  });

  it("mexer só em observação não marca; fatura paga => 422 INVOICE_PAID_LOCKED", async () => {
    const sub = await create();
    await open(NOV);
    const [oct, nov] = await charges(sub.id);
    const note = await call(mariana(), "PATCH", `/api/v1/transactions/${oct?.transactionId}`, {
      version: 1,
      note: "ok",
    });
    expect(note.status).toBe(200);
    expect((await charges(sub.id))[0]?.isAmended).toBe(false);
    const inv = await db.cardInvoice.findFirstOrThrow({
      where: { id: nov?.transaction?.invoiceId as string },
    });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: inv.id, cardId: card.id, ref: inv.referenceMonth },
      account: itau,
      amountInCents: 5590,
      paidOn: "2026-11-18",
    });
    const res = await call(mariana(), "PATCH", `/api/v1/transactions/${nov?.transactionId}`, {
      version: 1,
      amountInCents: 5990,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVOICE_PAID_LOCKED");
    expect((await charges(sub.id))[1]?.isAmended).toBe(false);
  });
});

describe("US-097 AC3-4: reajustar e impacto", () => {
  it("reajuste a partir de dezembro: passado e alteradas ficam; fromMonth cobrado => 422", async () => {
    const sub = await create();
    await open(NOV);
    const nov = (await charges(sub.id))[1];
    await call(mariana(), "PATCH", `/api/v1/transactions/${nov?.transactionId}`, {
      version: 1,
      amountInCents: 4500,
    });
    const bad = await patch(sub.id, {
      version: 1,
      amountInCents: 5990,
      effectiveFromMonth: "2026-11",
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("EFFECTIVE_FROM_ALREADY_CHARGED");
    expect(bad.body.error.message).toBe("Esse mês já foi cobrado; corrija a cobrança no Extrato");
    const ok = await patch(sub.id, {
      version: 1,
      amountInCents: 5990,
      effectiveFromMonth: "2026-12",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.subscription.version).toBe(2);
    await open(DEC);
    expect((await charges(sub.id)).map(cents)).toEqual([5590, 4500, 5990]);
    expect(await db.cardSubscriptionAmount.count({ where: { subscriptionId: sub.id } })).toBe(2);
    const row = await db.cardSubscription.findFirstOrThrow({ where: { id: sub.id } });
    expect(row.updatedByMemberId).toBe(fx.byName.Mariana?.memberId);
  });

  it("sem effectiveFromMonth vale do próximo mês não cobrado; sem diferença => 200 sem subir version", async () => {
    const sub = await create();
    await open(NOV);
    const same = await patch(sub.id, { version: 1, amountInCents: 5590, description: "Netflix" });
    expect(same.status).toBe(200);
    expect(same.body.subscription.version).toBe(1);
    expect(await db.cardSubscriptionAmount.count({ where: { subscriptionId: sub.id } })).toBe(1);
    expect((await patch(sub.id, { version: 1, amountInCents: 5990 })).status).toBe(200);
    await open(DEC);
    expect((await charges(sub.id)).map(cents)).toEqual([5590, 5590, 5990]);
  });

  it("campo extra, mês sem valor e valor inválido => 400; descrição e categoria valem adiante", async () => {
    const sub = await create();
    expect((await patch(sub.id, { version: 1, dayOfMonth: 12 })).status).toBe(400);
    expect((await patch(sub.id, { version: 1, cardId: card.id })).status).toBe(400);
    expect((await patch(sub.id, { version: 1, effectiveFromMonth: "2026-12" })).status).toBe(400);
    expect((await patch(sub.id, { version: 1, amountInCents: 12.5 })).status).toBe(400);
    const ok = await patch(sub.id, { version: 1, description: "Netflix 4K" });
    expect(ok.status).toBe(200);
    await open(NOV);
    expect((await charges(sub.id)).map((c) => c.transaction?.description)).toEqual([
      "Netflix 4K",
      "Netflix 4K",
    ]);
  });

  it("impact: sem fim => null; com fim => N; mantidas contam lançadas e alteradas", async () => {
    const open1 = await create();
    const fim = await create({ description: "Spotify", end: { type: "COUNT", count: 4 } }); // out..jan
    await open(NOV);
    const nov = (await charges(open1.id))[1];
    await call(mariana(), "PATCH", `/api/v1/transactions/${nov?.transactionId}`, {
      version: 1,
      amountInCents: 4500,
    });
    const a = await call(mariana(), "GET", `/api/v1/subscriptions/${open1.id}?impactFrom=2026-12`);
    expect(a.body.impact).toEqual({ affectedCount: null, keptPostedCount: 2, keptAmendedCount: 1 });
    const b = await call(mariana(), "GET", `/api/v1/subscriptions/${fim.id}?impactFrom=2026-12`);
    expect(b.body.impact).toEqual({ affectedCount: 2, keptPostedCount: 2, keptAmendedCount: 0 });
    const c = await call(mariana(), "GET", `/api/v1/subscriptions/${fim.id}`);
    expect(c.body.impact).toBeUndefined();
  });
});

describe("US-097 AC5-6: encerrar", () => {
  it("dia 5 com cobrança dia 10: nada é lançado depois", async () => {
    const sub = await create();
    const r = await end(sub.id, 1);
    expect(r.status).toBe(200);
    expect(r.body.subscription).toMatchObject({
      endedOn: "2026-10-05",
      nextChargeOn: null,
      version: 2,
    });
    await open(DEC);
    expect(await charges(sub.id)).toHaveLength(0);
    const row = await db.cardSubscription.findFirstOrThrow({ where: { id: sub.id } });
    expect(row.endedByMemberId).toBe(fx.byName.Mariana?.memberId);
  });

  it("cobrança dia 3 não lançada ainda é lançada antes de encerrar e o histórico fica", async () => {
    const sub = await at("2026-10-01T15:00:00Z", () => create({ dayOfMonth: 3 }));
    const r = await end(sub.id, 1);
    expect(r.status).toBe(200);
    const rows = await charges(sub.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("POSTED");
    await open(DEC);
    expect(await charges(sub.id)).toHaveLength(1);
    expect(
      await db.transaction.count({
        where: { familyId: fx.family.id, origin: "SUBSCRIPTION", deletedAt: null },
      }),
    ).toBe(1);
  });

  it("encerrada: editar e encerrar de novo => 409 SUBSCRIPTION_ENDED", async () => {
    const sub = await create();
    await end(sub.id, 1);
    for (const r of [
      await patch(sub.id, { version: 2, amountInCents: 100 }),
      await end(sub.id, 2),
    ]) {
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("SUBSCRIPTION_ENDED");
      expect(r.body.error.message).toBe("Esta assinatura já foi encerrada.");
    }
  });

  it("encerrar em Promise.all: chaves diferentes => 200 + 409; mesma chave => dois 200 e um encerramento", async () => {
    const a = await create();
    const rs = await Promise.all([end(a.id, 1), end(a.id, 1)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)?.body.error.code).toBe("SUBSCRIPTION_ENDED");
    const b = await create({ description: "Spotify" });
    const same = await Promise.all([
      end(b.id, 1, mariana(), "9d0f4a2e-5a53-4c46-9f43-2f7e9a1c0001"),
      end(b.id, 1, mariana(), "9d0f4a2e-5a53-4c46-9f43-2f7e9a1c0001"),
    ]);
    expect(same.map((r) => r.status)).toEqual([200, 200]);
    expect((await db.cardSubscription.findFirstOrThrow({ where: { id: b.id } })).version).toBe(2);
  });
});

describe("US-097 AC7: concorrência", () => {
  it("duas edições simultâneas (chaves diferentes) => 200 e 409 com o nome de quem alterou", async () => {
    const sub = await create();
    const rs = await Promise.all([
      patch(sub.id, { version: 1, description: "Netflix A" }),
      patch(sub.id, { version: 1, amountInCents: 7000 }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const lost = rs.find((r) => r.status === 409);
    expect(lost?.body.error.code).toBe("VERSION_CONFLICT");
    expect(lost?.body.error.message).toBe(
      "Esta assinatura foi alterada por Mariana. Recarregue para continuar.",
    );
    expect((await db.cardSubscription.findFirstOrThrow({ where: { id: sub.id } })).version).toBe(2);
  });

  it("mesma Idempotency-Key em Promise.all => dois 200 e uma só alteração", async () => {
    const sub = await create();
    const key = "9d0f4a2e-5a53-4c46-9f43-2f7e9a1c0002";
    const rs = await Promise.all([
      patch(sub.id, { version: 1, amountInCents: 7000 }, mariana(), key),
      patch(sub.id, { version: 1, amountInCents: 7000 }, mariana(), key),
    ]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(await db.cardSubscriptionAmount.count({ where: { subscriptionId: sub.id } })).toBe(2);
    expect((await db.cardSubscription.findFirstOrThrow({ where: { id: sub.id } })).version).toBe(2);
  });
});

describe("US-097 AC8: quem controla (spec 01)", () => {
  it("segundo membro vê a assinatura mas não edita nem encerra a 'Só meu' alheia (403)", async () => {
    const sub = await create();
    const seen = await call(lucas(), "GET", `/api/v1/subscriptions/${sub.id}`);
    expect(seen.status).toBe(200);
    expect((await call(lucas(), "GET", "/api/v1/subscriptions")).body.items).toHaveLength(1);
    const p = await patch(sub.id, { version: 1, amountInCents: 100 }, lucas());
    expect(p.status).toBe(403);
    expect(p.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    expect((await end(sub.id, 1, lucas())).status).toBe(403);
    const row = await db.cardSubscription.findFirstOrThrow({ where: { id: sub.id } });
    expect(row).toMatchObject({ version: 1, endedAt: null });
  });

  it("ninguém age em nome de outro: trocar o pagador para outro membro => 403", async () => {
    const sub = await create();
    const r = await patch(sub.id, { version: 1, payerMemberId: fx.byName.Lucas?.memberId });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("outra família: 404", async () => {
    const sub = await create();
    const other = await makeFamily({ uniqueEmails: true });
    const as = other.byName.Mariana?.as ?? null;
    expect((await call(as, "GET", `/api/v1/subscriptions/${sub.id}`)).status).toBe(404);
    expect((await patch(sub.id, { version: 1, amountInCents: 100 }, as)).status).toBe(404);
    expect((await end(sub.id, 1, as)).status).toBe(404);
  });
});
