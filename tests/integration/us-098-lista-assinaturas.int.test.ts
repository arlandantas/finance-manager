import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type CardFixture, type FamilyFixture, makeCard, makeFamily } from "../support/factories";

// US-098 (ADR-036, spec 12): lista de assinaturas, total mensal e por cartão.
const db = testDb();
const SIGNUP = "2026-10-05T15:00:00Z";
let fx: FamilyFixture;
let cardA: CardFixture;
let cardB: CardFixture;
let lazer: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(SIGNUP);
  fx = await makeFamily();
  cardA = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  cardB = await makeCard(fx, { name: "Itaú", owner: "Lucas", closingDay: 20, dueDay: 28 });
  lazer = (
    await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer e restaurantes" },
    })
  ).id;
});

const create = async (
  as: ReturnType<typeof mariana>,
  description: string,
  amountInCents: number,
  card = cardA,
  over: Record<string, unknown> = {},
) => {
  const r = await call(as, "POST", "/api/v1/subscriptions", {
    cardId: card.id,
    description,
    amountInCents,
    categoryId: lazer,
    dayOfMonth: 10,
    end: { type: "NONE" },
    ...over,
  });
  expect(r.status).toBe(201);
  return r.body.subscription as { id: string; version: number };
};
const list = (qs = "", as = mariana()) => call(as, "GET", `/api/v1/subscriptions${qs}`);

describe("US-098 AC1-2: total e por cartão", () => {
  it("Netflix 55,90 + Spotify 21,90 => 7780; A 7780 e B 3990; Σ byCard = total", async () => {
    await create(mariana(), "Netflix", 5590);
    await create(mariana(), "Spotify", 2190);
    await create(lucas(), "Hulu", 3990, cardB);
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.totalInCents).toBe(11770);
    expect(res.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Netflix",
      "Hulu",
      "Spotify",
    ]);
    expect(res.body.byCard).toEqual([
      { cardId: cardA.id, cardName: "Nubank", totalInCents: 7780 },
      { cardId: cardB.id, cardName: "Itaú", totalInCents: 3990 },
    ]);
    const only = await list(`?cardId=${cardA.id}`);
    expect(only.body.totalInCents).toBe(7780);
  });
});

describe("US-098 AC3: filtros e reajuste futuro", () => {
  it("quem gastou recorta lista e totais; reajuste de janeiro não muda o mês corrente", async () => {
    const netflix = await create(mariana(), "Netflix", 5590);
    await create(lucas(), "Hulu", 3990, cardB);
    const mine = await list(`?payerId=${fx.byName.Lucas?.memberId}`);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.totalInCents).toBe(3990);
    expect(mine.body.byCard).toHaveLength(1);
    const patch = await call(mariana(), "PATCH", `/api/v1/subscriptions/${netflix.id}`, {
      version: netflix.version,
      amountInCents: 9990,
      effectiveFromMonth: "2027-01",
    });
    expect(patch.status).toBe(200);
    expect((await list()).body.totalInCents).toBe(5590 + 3990);
  });
});

describe("US-098 AC4: encerrar move para Encerradas", () => {
  it("encerrada sai do total, aparece em ended com a data, sem total e sem edição", async () => {
    const netflix = await create(mariana(), "Netflix", 5590);
    await create(mariana(), "Spotify", 2190);
    const end = await call(mariana(), "POST", `/api/v1/subscriptions/${netflix.id}/end`, {
      version: netflix.version,
    });
    expect(end.status).toBe(200);
    const active = await list();
    expect(active.body.totalInCents).toBe(2190);
    expect(active.body.items).toHaveLength(1);
    const ended = await list("?status=ended");
    expect(ended.body.items).toHaveLength(1);
    expect(ended.body.items[0]).toMatchObject({
      description: "Netflix",
      endedOn: "2026-10-05",
      canEdit: false,
    });
    expect(ended.body.totalInCents).toBe(0);
    expect(ended.body.byCard).toEqual([]);
  });
});

describe("US-098: canEdit e selo", () => {
  it("todos veem; só quem controla edita; selo da cobrança corrigida no mês", async () => {
    const netflix = await create(mariana(), "Netflix", 5590);
    const asLucas = await list("", lucas());
    expect(asLucas.body.items).toHaveLength(1);
    expect(asLucas.body.items[0]).toMatchObject({ canEdit: false, amendedThisMonth: false });
    expect((await list()).body.items[0].canEdit).toBe(true);
    setDevClockOverride("2026-10-20T15:00:00Z");
    await list(); // lança a cobrança de outubro
    await db.subscriptionCharge.updateMany({
      where: { subscriptionId: netflix.id },
      data: { isAmended: true },
    });
    expect((await list()).body.items[0].amendedThisMonth).toBe(true);
  });

  it("cartão arquivado segue na lista", async () => {
    await create(lucas(), "Hulu", 3990, cardB);
    await db.creditCard.update({ where: { id: cardB.id }, data: { archivedAt: new Date() } });
    const r = await list();
    expect(r.status).toBe(200);
    expect(r.body.items[0].card).toMatchObject({ name: "Itaú", archived: true });
    expect(r.body.totalInCents).toBe(3990);
  });
});

describe("US-098 AC6: isolamento por família", () => {
  it("outra família nunca aparece (lista, total, filtros)", async () => {
    await create(mariana(), "Netflix", 5590);
    const other = await makeFamily({
      name: "Família Souza",
      uniqueEmails: true,
      members: [{ email: "x@exemplo.com", name: "Carla Souza", role: "ADMIN" }],
    });
    const empty = await list("", other.byName.Carla?.as ?? null);
    expect(empty.body).toEqual({ items: [], totalInCents: 0, byCard: [] });
    const forged = await list(`?cardId=${cardA.id}`, other.byName.Carla?.as ?? null);
    expect(forged.body.items).toEqual([]);
    expect(forged.body.totalInCents).toBe(0);
  });
});
