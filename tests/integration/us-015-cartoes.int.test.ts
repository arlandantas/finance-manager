import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as idempotency from "@/lib/api/idempotency";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeCard, makeFamily } from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const base = { name: "Nubank Mariana", limitInCents: 500000, closingDay: 25, dueDay: 5 };

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
});

const create = (as: ReturnType<typeof mariana>, body: Record<string, unknown>, opts = {}) =>
  call(as, "POST", "/api/v1/cards", body, opts);
const patch = (as: ReturnType<typeof mariana>, id: string, body: Record<string, unknown>) =>
  call(as, "PATCH", `/api/v1/cards/${id}`, body);

describe("US-015 Cadastrar cartão com sucesso", () => {
  it("POST /cards => 201 com limite, usado 0, disponível e fatura aberta virtual", async () => {
    const res = await create(mariana(), base);
    expect(res.status).toBe(201);
    expect(res.body.card).toMatchObject({
      name: "Nubank Mariana",
      limitInCents: 500000,
      usedInCents: 0,
      availableInCents: 500000,
      closingDay: 25,
      dueDay: 5,
      cycleLocked: false,
      version: 1,
      institution: "Outro",
      owner: { id: fx.byName.Mariana?.memberId },
      payableInvoices: [],
    });
    expect(res.body.card.openInvoice).toMatchObject({
      totalInCents: 0,
      purchasesCount: 0,
      status: "OPEN",
      paidOn: null,
    });
  });

  it("titular padrão = membro logado; titular informado é respeitado; de outra família => 422", async () => {
    const own = await create(lucas(), { ...base, name: "Do Lucas" });
    expect(own.body.card.owner.id).toBe(fx.byName.Lucas?.memberId);
    const other = await create(lucas(), {
      ...base,
      name: "Da Mariana",
      ownerMemberId: fx.byName.Mariana?.memberId,
    });
    expect(other.body.card.owner.id).toBe(fx.byName.Mariana?.memberId);
    const alien = await makeFamily({ uniqueEmails: true });
    const bad = await create(lucas(), {
      ...base,
      name: "Xx",
      ownerMemberId: alien.members[0]?.memberId,
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("INVALID_REFERENCE");
  });

  it("cartão não altera o saldo da família", async () => {
    await makeAccount(fx, { name: "Itaú Mariana", openingBalanceInCents: 650000 });
    await makeAccount(fx, { name: "Nubank Conjunta", openingBalanceInCents: 84950 });
    const before = (await call(mariana(), "GET", "/api/v1/accounts")).body.totalBalanceInCents;
    await create(mariana(), base);
    const after = (await call(mariana(), "GET", "/api/v1/accounts")).body.totalBalanceInCents;
    expect(before).toBe(734950);
    expect(after).toBe(734950);
  });
});

describe("US-015 Validação", () => {
  it("campos obrigatórios / dia 31 / limite 0 => 400 e nada criado", async () => {
    for (const body of [
      {},
      { ...base, closingDay: 31 },
      { ...base, limitInCents: 0 },
      { ...base, dueDay: 0 },
    ]) {
      const res = await create(mariana(), body);
      expect(res.status).toBe(400);
    }
    expect(await db.creditCard.count()).toBe(0);
  });

  it("nome duplicado ('nubank mariana ') => 409; corrida com chaves diferentes => 1x201 e 1x409", async () => {
    await create(mariana(), base);
    const dup = await create(mariana(), { ...base, name: "nubank mariana " });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_CARD_NAME");
    expect(dup.body.error.message).toBe("Já existe um cartão com este nome");
    const [a, b] = await Promise.all([
      create(mariana(), { ...base, name: "Inter" }),
      create(lucas(), { ...base, name: "INTER" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.creditCard.count()).toBe(2);
  });
});

describe("US-015 Visibilidade, isolamento e edição", () => {
  it("Lucas lista o cartão de Mariana com o mesmo limite", async () => {
    await makeCard(fx, { name: "Nubank Mariana", owner: "Mariana", limitInCents: 500000 });
    const res = await call(lucas(), "GET", "/api/v1/cards");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: "Nubank Mariana", limitInCents: 500000 });
    expect(res.body).toMatchObject({ totalLimitInCents: 500000, totalUsedInCents: 0 });
  });

  it("isolamento: GET/PATCH /cards/:id de outra família => 404; listagem não vaza", async () => {
    const card = await makeCard(fx, { name: "Nubank Mariana" });
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await call(b, "GET", `/api/v1/cards/${card.id}`)).status).toBe(404);
    expect((await patch(b, card.id, { version: 1, name: "Zz" })).status).toBe(404);
    expect((await call(b, "GET", "/api/v1/cards")).body.items).toHaveLength(0);
    await makeCard(other, { name: "Visa Souza" });
    expect(
      (await call(mariana(), "GET", "/api/v1/cards")).body.items.map(
        (c: { name: string }) => c.name,
      ),
    ).toEqual(["Nubank Mariana"]);
  });

  it("editar nome e limite => 200, version 2; limite abaixo do usado é aceito", async () => {
    const card = await makeCard(fx, { name: "Nubank Mariana", limitInCents: 500000 });
    const res = await patch(mariana(), card.id, {
      version: 1,
      name: "Nubank Roxinho",
      limitInCents: 600000,
    });
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({
      name: "Nubank Roxinho",
      limitInCents: 600000,
      version: 2,
    });
    const same = await patch(mariana(), card.id, { version: 2, name: "Nubank Roxinho" });
    expect(same.status).toBe(200);
    expect(same.body.card.version).toBe(2);
  });

  it("dias editáveis sem fatura => 200", async () => {
    const card = await makeCard(fx, { name: "Nubank Mariana" });
    const res = await patch(mariana(), card.id, { version: 1, closingDay: 20 });
    expect(res.status).toBe(200);
    expect(res.body.card.closingDay).toBe(20);
  });

  it("conflito: dois PATCH com a mesma version => 1x200 e 1x409; sequencial com mensagem exata", async () => {
    const card = await makeCard(fx, { name: "Nubank Mariana" });
    const [a, b] = await Promise.all([
      patch(mariana(), card.id, { version: 1, limitInCents: 600000 }),
      patch(lucas(), card.id, { version: 1, limitInCents: 700000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(row.version).toBe(2);
    const card2 = await makeCard(fx, { name: "Outro" });
    await patch(mariana(), card2.id, { version: 1, limitInCents: 600000 });
    const res = await patch(lucas(), card2.id, { version: 1, limitInCents: 700000 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "Este cartão foi alterado por Mariana. Recarregue para continuar.",
    );
  });

  it("renomear para nome existente => 409 DUPLICATE_CARD_NAME", async () => {
    await makeCard(fx, { name: "Inter" });
    const card = await makeCard(fx, { name: "Nubank" });
    const res = await patch(mariana(), card.id, { version: 1, name: "inter" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_CARD_NAME");
  });
});

describe("US-015 Infra", () => {
  it("duplo envio com a mesma chave => 1 cartão", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      create(mariana(), base, { idempotencyKey: key }),
      create(mariana(), base, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await db.creditCard.count()).toBe(1);
  });

  it(".strict(): familyId/closingDate no corpo => 400", async () => {
    expect((await create(mariana(), { ...base, familyId: fx.family.id })).status).toBe(400);
    expect((await create(mariana(), { ...base, closingDate: "2026-10-25" })).status).toBe(400);
  });

  it("atomicidade: falha injetada após o INSERT => nada persiste", async () => {
    vi.spyOn(idempotency, "saveIdempotentResponse").mockRejectedValueOnce(
      new Error("falha injetada"),
    );
    const res = await create(mariana(), base);
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.creditCard.count()).toBe(0);
  });

  it("banco: CHECKs rejeitam closingDay 29 e limite 0", async () => {
    const owner = fx.byName.Mariana?.memberId;
    const insert = (closing: number, limit: number) =>
      db.$executeRawUnsafe(
        `INSERT INTO credit_cards (id, "familyId", name, "ownerMemberId", "limitInCents", "closingDay", "dueDay", "updatedAt")
         VALUES (gen_random_uuid(), '${fx.family.id}'::uuid, 'X${closing}${limit}', '${owner}'::uuid, ${limit}, ${closing}, 5, now())`,
      );
    await expect(insert(29, 100)).rejects.toThrow(/credit_cards_closing_chk/);
    await expect(insert(25, 0)).rejects.toThrow(/credit_cards_limit_chk/);
    await expect(insert(25, 100)).resolves.toBeDefined();
  });
});
