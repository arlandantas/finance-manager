import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
} from "../support/factories";

// US-096b (ADR-036, spec 12): lançamento ao abrir telas, arquivar cartão, remoção de membro e exportação.
const db = testDb();
const NOW = "2026-11-20T15:00:00Z";
const CHARGE_DAY = "2026-12-10T15:00:00Z"; // dia da cobrança (dia 10)
let fx: FamilyFixture;
let card: CardFixture;
let lazer: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const catOf = async (familyId: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId, name: "Lazer e restaurantes" } })).id;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 900000 });
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  lazer = await catOf(fx.family.id);
});

const subBody = (over: Record<string, unknown> = {}, cardId = card.id, categoryId = lazer) => ({
  cardId,
  description: "Netflix",
  amountInCents: 3990,
  categoryId,
  dayOfMonth: 10,
  end: { type: "NONE" },
  ...over,
});
const create = (over: Record<string, unknown> = {}, as = mariana(), cardId = card.id) =>
  call(as, "POST", "/api/v1/subscriptions", subBody(over, cardId));
const at = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
  setDevClockOverride(iso);
  try {
    return await fn();
  } finally {
    setDevClockOverride(NOW);
  }
};
const purchases = (familyId = fx.family.id) =>
  db.transaction.findMany({ where: { familyId, origin: "SUBSCRIPTION" } });

const reads: Record<string, () => Promise<{ status: number; body: any }>> = {
  home: () => call(mariana(), "GET", "/api/v1/home"),
  cards: () => call(mariana(), "GET", "/api/v1/cards"),
  invoice: () => call(mariana(), "GET", `/api/v1/cards/${card.id}/invoices/2026-12`),
  extrato: () => call(mariana(), "GET", "/api/v1/transactions"),
};

describe("US-096b AC1-2: lançamento ao abrir as telas", () => {
  for (const [name, read] of Object.entries(reads)) {
    it(`GET ${name} lança a cobrança do dia sem chamar /subscriptions`, async () => {
      expect((await create()).status).toBe(201);
      expect(await purchases()).toHaveLength(0);
      const r = await at(CHARGE_DAY, read);
      expect(r.status).toBe(200);
      const rows = await purchases();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ description: "Netflix", cardId: card.id });
      expect(Number(rows[0]?.amountInCents)).toBe(3990);
      if (name === "extrato") {
        expect(JSON.stringify(r.body)).toContain(rows[0]?.id);
      }
    });
  }

  it("as quatro leituras em Promise.all geram uma compra só", async () => {
    await create();
    const rs = await at(CHARGE_DAY, () => Promise.all(Object.values(reads).map((f) => f())));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await purchases()).toHaveLength(1);
    expect(
      await db.subscriptionCharge.count({ where: { familyId: fx.family.id, status: "POSTED" } }),
    ).toBe(1);
  });

  it("duas assinaturas, leituras concorrentes: uma compra por assinatura", async () => {
    await create();
    await create({ description: "Spotify", dayOfMonth: 10 });
    await at(CHARGE_DAY, () => Promise.all(Object.values(reads).map((f) => f())));
    const rows = await purchases();
    expect(rows.map((r) => r.description).sort()).toEqual(["Netflix", "Spotify"]);
  });
});

describe("US-096b AC3: arquivar cartão", () => {
  it("assinatura ativa impede; encerrada libera", async () => {
    const s = (await create()).body.subscription;
    const check = await call(mariana(), "GET", `/api/v1/cards/${card.id}/archive-check`);
    expect(check.body.blockers.map((b: { code: string }) => b.code)).toEqual([
      "CARD_HAS_ACTIVE_SUBSCRIPTIONS",
    ]);
    const version = (await db.creditCard.findUniqueOrThrow({ where: { id: card.id } })).version;
    const no = await call(mariana(), "POST", `/api/v1/cards/${card.id}/archive`, { version });
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe("CARD_HAS_ACTIVE_SUBSCRIPTIONS");
    await db.cardSubscription.update({
      where: { id: s.id },
      data: {
        endedAt: new Date(NOW),
        endedOn: new Date("2026-11-20"),
        endedByMemberId: mid("Mariana"),
        nextChargeOn: null,
      },
    });
    const ok = await call(mariana(), "POST", `/api/v1/cards/${card.id}/archive`, { version });
    expect(ok.status).toBe(200);
  });

  it("assinatura em outro cartão não bloqueia este", async () => {
    const other = await makeCard(fx, { name: "Outro", owner: "Mariana" });
    await create({}, mariana(), other.id);
    const check = await call(mariana(), "GET", `/api/v1/cards/${card.id}/archive-check`);
    expect(check.body.blockers).toEqual([]);
  });
});

describe("US-096b AC4: remoção de membro", () => {
  it("o pagador removido passa a assinatura ao destino das previstas", async () => {
    const s = await create({}, lucas());
    expect(s.status).toBe(201);
    const review = await call(mariana(), "GET", `/api/v1/members/${mid("Lucas")}/removal-review`);
    expect(review.body.subscriptions).toHaveLength(1);
    const r = await call(mariana(), "POST", `/api/v1/members/${mid("Lucas")}/remove`, {});
    expect(r.status).toBe(200);
    const row = await db.cardSubscription.findUniqueOrThrow({
      where: { id: s.body.subscription.id },
    });
    expect(row.payerMemberId).toBe(mid("Mariana"));
    expect(row.version).toBe(2);
    expect(row.endedAt).toBeNull();
  });

  it("titular do cartão com assinatura ativa exige reatribuir (CARD_NEEDS_OWNER)", async () => {
    const lcard = await makeCard(fx, { name: "Do Lucas", owner: "Lucas" });
    await create({}, lucas(), lcard.id);
    const review = await call(mariana(), "GET", `/api/v1/members/${mid("Lucas")}/removal-review`);
    expect(review.body.cards[0]).toMatchObject({ mustReassign: true, defaultAction: "REASSIGN" });
    const blocked = await call(mariana(), "POST", `/api/v1/members/${mid("Lucas")}/remove`, {});
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details.blockers).toEqual([
      { code: "CARD_NEEDS_OWNER", ids: [lcard.id] },
    ]);
    expect(
      (await db.creditCard.findUniqueOrThrow({ where: { id: lcard.id } })).archivedAt,
    ).toBeNull();
    const ok = await call(mariana(), "POST", `/api/v1/members/${mid("Lucas")}/remove`, {
      reassign: { cards: { [lcard.id]: mid("Mariana") } },
    });
    expect(ok.status).toBe(200);
    const sub = await db.cardSubscription.findFirstOrThrow({ where: { cardId: lcard.id } });
    expect(sub.payerMemberId).toBe(mid("Mariana"));
  });
});

describe("US-096b AC5: falha no lançamento não derruba a leitura", () => {
  it("lançamento que falha: 200 e nada parcial", async () => {
    const s = (await create()).body.subscription;
    await db.cardSubscriptionAmount.deleteMany({ where: { subscriptionId: s.id } });
    const r = await at(CHARGE_DAY, reads.cards as () => Promise<{ status: number; body: any }>);
    expect(r.status).toBe(200);
    expect(await purchases()).toHaveLength(0);
    expect(await db.subscriptionCharge.count({ where: { familyId: fx.family.id } })).toBe(0);
    const sub = await db.cardSubscription.findUniqueOrThrow({ where: { id: s.id } });
    expect(sub.nextChargeOn?.toISOString().slice(0, 10)).toBe("2026-12-10");
  });
});

describe("US-096b AC6: exportação (LGPD)", () => {
  it("traz as assinaturas da família e nenhuma de outra; sem Só meu alheio", async () => {
    const mine = (await create()).body.subscription;
    await create({ description: "Do Lucas" }, lucas());
    const other = await makeFamily({
      name: "Outra",
      members: [{ email: "zoe@exemplo.com", name: "Zoe", role: "ADMIN" }],
    });
    const ocard = await makeCard(other, { name: "Zoe card", owner: "Zoe" });
    const zoe = other.byName.Zoe?.as ?? null;
    const sz = await call(zoe, "POST", "/api/v1/subscriptions", {
      ...subBody({ description: "Da Zoe" }, ocard.id, await catOf(other.family.id)),
    });
    expect(sz.status).toBe(201);

    const ex = await call(mariana(), "GET", "/api/v1/me/export");
    expect(ex.status).toBe(200);
    const list = ex.body.familiaAtual.assinaturas;
    expect(list).toEqual([
      {
        id: mine.id,
        cartaoId: card.id,
        descricao: "Netflix",
        categoriaId: lazer,
        pagadorMemberId: mid("Mariana"),
        dia: 10,
        valorAtualEmCentavos: 3990,
        inicio: "2026-12-10",
        fim: null,
        encerradaEm: null,
      },
    ]);
    expect(JSON.stringify(ex.body)).not.toContain("Da Zoe");
    const exLucas = await call(lucas(), "GET", "/api/v1/me/export");
    expect(
      exLucas.body.familiaAtual.assinaturas.map((a: { descricao: string }) => a.descricao),
    ).toEqual(["Do Lucas"]);
  });
});
