import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
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
  makeTag,
  makeTransaction,
  makeTransfer,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

// US-047 (SDD-016 §8): filtrar o Extrato por tag (EXISTS dentro de buildLedgerWhere; lista e totais juntos).
const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const list = (qs: string, f: FamilyFixture = fx) =>
  at(() => call(f.byName.Lucas?.as ?? null, "GET", `/api/v1/transactions?${qs}`));
const descs = (res: { body: { items: Array<{ description: string }> } }) =>
  res.body.items.map((i) => i.description).sort();
const tagId = async (name: string, f: FamilyFixture = fx) => (await makeTag(f, name)).id;

let hotel: { id: string };
beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 900000 });
  const base = { account: acc, occurredOn: "2026-07-10", author: "Mariana" } as const;
  hotel = await makeTransaction(fx, {
    ...base,
    category: "Lazer e restaurantes",
    amountInCents: 80000,
    description: "Hotel",
    tags: ["viagem-nordeste"],
  });
  await makeTransaction(fx, {
    ...base,
    category: "Lazer e restaurantes",
    amountInCents: 25000,
    description: "Restaurante",
    tags: ["viagem-nordeste"],
  });
  await makeTransaction(fx, {
    ...base,
    category: "Supermercado",
    amountInCents: 30000,
    description: "Mercado",
  });
  await makeTransaction(fx, {
    ...base,
    category: "Transporte",
    amountInCents: 60000,
    description: "Passagem",
    tags: ["viagem-nordeste", "ferias"],
  });
});

describe("US-047 filtrar por tag", () => {
  it("uma tag: Hotel, Restaurante e Passagem; total de despesas 165000", async () => {
    const t = await tagId("viagem-nordeste");
    const res = await list(`period=2026-07&tagIds=${t}`);
    expect(res.status).toBe(200);
    expect(descs(res)).toEqual(["Hotel", "Passagem", "Restaurante"]);
    expect(res.body.totals.expenseInCents).toBe(165000);
    expect(res.body.totals.count).toBe(3);
  });

  it("duas tags (OU): cada lançamento uma vez, total sem somar em dobro", async () => {
    const a = await tagId("viagem-nordeste");
    const b = await tagId("ferias");
    const res = await list(`period=2026-07&tagIds=${a}&tagIds=${b}`);
    expect(res.status).toBe(200);
    expect(
      res.body.items.filter((i: { description: string }) => i.description === "Passagem"),
    ).toHaveLength(1);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.totals.expenseInCents).toBe(165000);
    expect(res.body.totals.count).toBe(3);
  });

  it("combina com categoria (E entre filtros)", async () => {
    const t = await tagId("viagem-nordeste");
    const transporte = (
      await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Transporte" } })
    ).id;
    const res = await list(`period=2026-07&tagIds=${t}&categoryIds=${transporte}`);
    expect(descs(res)).toEqual(["Passagem"]);
    expect(res.body.totals.expenseInCents).toBe(60000);
  });

  it("tag sem lançamentos no período => lista vazia e totais zerados", async () => {
    const t = await tagId("ferias");
    const res = await list(`period=2026-08&tagIds=${t}`);
    expect(res.body.items).toEqual([]);
    expect(res.body.totals).toMatchObject({ expenseInCents: 0, incomeInCents: 0, count: 0 });
  });

  it("lançamento excluído não entra no total (Hotel excluído => 85000)", async () => {
    await db.transaction.update({
      where: { id: hotel.id },
      data: {
        deletedAt: new Date(),
        deletionReason: "DELETED",
        deletedByMemberId: fx.byName.Mariana?.memberId as string,
      },
    });
    const t = await tagId("viagem-nordeste");
    const res = await list(`period=2026-07&tagIds=${t}`);
    expect(descs(res)).toEqual(["Passagem", "Restaurante"]);
    expect(res.body.totals.expenseInCents).toBe(85000);
  });

  it("untagged=true: só despesa/receita sem tag (Mercado), sem transferências; com tagIds => 400", async () => {
    const other = await makeAccount(fx, { name: "Itaú", owner: "Lucas" });
    await makeTransfer(fx, { from: acc, to: other, amountInCents: 1000, occurredOn: "2026-07-11" });
    const res = await list("period=2026-07&untagged=true");
    expect(descs(res)).toEqual(["Mercado"]);
    expect(res.body.totals.expenseInCents).toBe(30000);
    const t = await tagId("ferias");
    const both = await list(`period=2026-07&untagged=true&tagIds=${t}`);
    expect(both.status).toBe(400);
    expect(both.body.error.message).toBe('Use tags ou "sem tag", não os dois');
  });

  it("tagIds inválido => 400; mais de 20 => 400; transferências somem com filtro de tag", async () => {
    expect((await list("period=2026-07&tagIds=abc")).status).toBe(400);
    const ids = Array.from({ length: 21 }, () => "11111111-1111-4111-8111-111111111111");
    expect((await list(`period=2026-07&${ids.map((i) => `tagIds=${i}`).join("&")}`)).status).toBe(
      400,
    );
    const other = await makeAccount(fx, { name: "Itaú", owner: "Lucas" });
    await makeTransfer(fx, { from: acc, to: other, amountInCents: 1000, occurredOn: "2026-07-11" });
    const t = await tagId("viagem-nordeste");
    const res = await list(`period=2026-07&tagIds=${t}`);
    expect(res.body.items.every((i: { type: string }) => i.type === "EXPENSE")).toBe(true);
  });

  it("isolamento: tagId de outra família devolve vazio (nunca vaza linhas)", async () => {
    const other = await makeFamily({ name: "Souza", uniqueEmails: true });
    const foreign = await tagId("viagem-nordeste", other);
    const res = await list(`period=2026-07&tagIds=${foreign}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totals.expenseInCents).toBe(0);
  });

  it("paginação por cursor mantém o filtro sem duplicar linhas", async () => {
    const a = await tagId("viagem-nordeste");
    const b = await tagId("ferias");
    const first = await list(`period=2026-07&tagIds=${a}&tagIds=${b}&limit=2`);
    expect(first.body.items).toHaveLength(2);
    const next = await list(
      `period=2026-07&tagIds=${a}&tagIds=${b}&limit=2&cursor=${first.body.nextCursor}`,
    );
    const all = [...first.body.items, ...next.body.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(3);
  });

  it("filtros plurais: payerIds (quem pagou) e sourceIds (conta ou cartão)", async () => {
    const lucasId = fx.byName.Lucas?.memberId as string;
    const marianaId = fx.byName.Mariana?.memberId as string;
    const res = await list(`period=2026-07&payerIds=${marianaId}&payerIds=${lucasId}`);
    expect(res.body.items).toHaveLength(4);
    expect((await list(`period=2026-07&payerIds=${lucasId}`)).body.items).toHaveLength(0);
    const card = await makeCard(fx, { name: "Visa", owner: "Lucas" });
    await makeCardPurchase(fx, {
      card,
      amountInCents: 7000,
      occurredOn: "2026-07-12",
      description: "Cartão",
    });
    const bySource = await list(`period=2026-07&sourceIds=${card.id}&sourceIds=${acc.id}`);
    expect(bySource.body.items).toHaveLength(5);
    expect((await list(`period=2026-07&sourceIds=${card.id}`)).body.items).toHaveLength(1);
  });
});

describe("US-047 compra parcelada", () => {
  it("filtro por tag em intervalo de 10 meses => 10 linhas e total das parcelas do período", async () => {
    const card: CardFixture = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      limitInCents: 2_000_000,
      closingDay: 25,
      dueDay: 5,
    });
    const res = await at(async () =>
      call(fx.byName.Mariana?.as ?? null, "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        cardId: card.id,
        categoryId: (
          await db.category.findFirstOrThrow({
            where: { familyId: fx.family.id, name: "Supermercado" },
          })
        ).id,
        amountInCents: 250000,
        installments: 10,
        description: "Notebook",
        occurredOn: "2026-10-01",
        tags: ["escritorio"],
      }),
    );
    expect(res.status).toBe(201);
    const t = await tagId("escritorio");
    const range = await list(`from=2026-10-01&to=2027-07-31&tagIds=${t}&limit=50`);
    expect(range.status).toBe(200);
    const parcels = range.body.items.filter(
      (i: { description: string }) => i.description === "Notebook",
    );
    expect(parcels).toHaveLength(10);
    expect(range.body.totals.expenseInCents).toBe(250000);
    // um único mês: só a parcela daquela competência
    const month = await list(`period=2026-10&tagIds=${t}`);
    expect(month.body.items).toHaveLength(1);
    expect(month.body.totals.expenseInCents).toBe(25000);
  });
});

describe("US-047 propriedade: tag não multiplica linhas nem totais (semente fixa)", () => {
  it("200 combinações: total filtrado = soma por lançamento distinto; count = itens", async () => {
    await resetDb();
    fx = await makeFamily();
    acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 0 });
    const rnd = mulberry32(2026);
    const names = ["a1", "b2", "c3", "d4", "e5"];
    const rows: Array<{ amount: number; tags: string[]; kind: "EXPENSE" | "INCOME" }> = [];
    for (let i = 0; i < 40; i++) {
      const k = Math.floor(rnd() * 4); // 0..3 tags
      const tags = names.filter(() => rnd() < k / 5);
      const kind = rnd() < 0.2 ? "INCOME" : "EXPENSE";
      const amount = 100 + Math.floor(rnd() * 9000);
      rows.push({ amount, tags, kind });
      await makeTransaction(fx, {
        account: acc,
        type: kind,
        category: kind === "INCOME" ? "Salário" : "Supermercado",
        amountInCents: amount,
        occurredOn: "2026-07-10",
        description: `L${i}`,
        tags,
      });
    }
    const ids = new Map<string, string>();
    for (const n of names) ids.set(n, await tagId(n));
    let checked = 0;
    for (let c = 0; c < 200; c++) {
      const pick = names.filter(() => rnd() < 0.45);
      const untagged = pick.length === 0 && rnd() < 0.5;
      const qs = [
        "period=2026-07",
        "limit=100",
        ...(untagged ? ["untagged=true"] : pick.map((n) => `tagIds=${ids.get(n)}`)),
      ].join("&");
      const res = await list(qs);
      expect(res.status).toBe(200);
      const match = rows.filter((r) =>
        untagged ? r.tags.length === 0 : pick.length === 0 || r.tags.some((t) => pick.includes(t)),
      );
      expect(res.body.items).toHaveLength(match.length);
      expect(new Set(res.body.items.map((i: { id: string }) => i.id)).size).toBe(match.length);
      expect(res.body.totals.expenseInCents).toBe(
        match.filter((r) => r.kind === "EXPENSE").reduce((s, r) => s + r.amount, 0),
      );
      expect(res.body.totals.incomeInCents).toBe(
        match.filter((r) => r.kind === "INCOME").reduce((s, r) => s + r.amount, 0),
      );
      checked++;
    }
    expect(checked).toBe(200);
  }, 120_000);
});
