import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { periodPredicate } from "@/modules/transacoes/ledger-where";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;

const post = async (body: Record<string, unknown>) =>
  at(async () =>
    call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: acc.id,
      categoryId: await catId("Supermercado"),
      amountInCents: 15050,
      ...body,
    }),
  );
const list = (qs: string) => at(() => call(lucas(), "GET", `/api/v1/transactions?${qs}`));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-024 descrição opcional (servidor já usa o nome da categoria)", () => {
  it("sem descrição, vazia ou só espaços => nome da categoria", async () => {
    for (const description of [undefined, "", "   "]) {
      const res = await post(description === undefined ? {} : { description });
      expect(res.status).toBe(201);
      expect(res.body.transaction.description).toBe("Supermercado");
    }
  });

  it("descrição informada é gravada com trim; curta/longa => 400 com a mensagem única", async () => {
    const ok = await post({ description: "  Mercado do bairro " });
    expect(ok.body.transaction.description).toBe("Mercado do bairro");
    for (const description of ["a", "x".repeat(101)]) {
      const res = await post({ description });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        "A descrição precisa ter entre 2 e 100 caracteres",
      );
    }
  });

  it("receita também usa a mensagem única", async () => {
    const res = await at(async () =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: acc.id,
        categoryId: await catId("Salário"),
        amountInCents: 100,
        description: "a",
      }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("A descrição precisa ter entre 2 e 100 caracteres");
  });

  it("PATCH da descrição => 200 e nova revisão", async () => {
    const created = await post({ description: "Feira" });
    const id = created.body.transaction.id;
    const res = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${id}`, {
        version: 1,
        description: "Feira do domingo",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.transaction.description).toBe("Feira do domingo");
    expect(res.body.transaction.version).toBe(2);
  });
});

describe("US-024 busca por descrição (q)", () => {
  beforeEach(async () => {
    for (const [description, amountInCents] of [
      ["Mercado do bairro", 15050],
      ["Padaria", 2000],
      ["Desconto 100% off", 3000],
      ["Taxa_mensal", 4000],
      ["MERCADO central", 5000],
    ] as const) {
      await makeTransaction(fx, {
        account: acc,
        category: "Supermercado",
        amountInCents,
        occurredOn: "2026-10-05",
        author: "Lucas",
        description,
      });
    }
  });

  it("q=bairro devolve só 'Mercado do bairro'; totais coerentes com a lista", async () => {
    const res = await list("q=bairro");
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Mercado do bairro",
    ]);
    expect(res.body.totals.expenseInCents).toBe(15050);
    expect(res.body.totals.count).toBe(1);
  });

  it("não diferencia maiúsculas (ILIKE) e casa em qualquer posição", async () => {
    const res = await list("q=mercado");
    expect(res.body.items).toHaveLength(2);
    expect(res.body.totals.expenseInCents).toBe(15050 + 5000);
  });

  it("%, _ e \\ são literais: 'q=%' não casa tudo", async () => {
    const pct = await list(`q=${encodeURIComponent("0% ")}`);
    expect(pct.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Desconto 100% off",
    ]);
    const wild = await list(`q=${encodeURIComponent("%%")}`);
    expect(wild.body.items).toHaveLength(0);
    const us = await list(`q=${encodeURIComponent("a_m")}`);
    expect(us.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Taxa_mensal",
    ]);
    const wildUs = await list(`q=${encodeURIComponent("__")}`);
    expect(wildUs.body.items).toHaveLength(0);
  });

  it("sem acento-insensibilidade (limitação documentada)", async () => {
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: "2026-10-05",
      author: "Lucas",
      description: "Pão francês",
    });
    expect((await list("q=pao")).body.items).toHaveLength(0);
    expect((await list("q=P%C3%A3o")).body.items).toHaveLength(1);
  });

  it("q com 1 caractere => 400; q combinado com outros filtros e com o período", async () => {
    expect((await list("q=a")).status).toBe(400);
    const combo = await list(`q=mercado&shared=true&period=2026-10`);
    expect(combo.status).toBe(200);
    expect((await list("q=mercado&period=2026-09")).body.items).toHaveLength(0);
  });

  it("propriedade: com q, Σ dos itens (despesas) = totais", async () => {
    for (const q of ["er", "ca", "ta", "ma"]) {
      const res = await list(`q=${q}`);
      const sum = res.body.items
        .filter((i: { type: string }) => i.type === "EXPENSE")
        .reduce((s: number, i: { amountInCents: number }) => s + i.amountInCents, 0);
      expect(sum).toBe(res.body.totals.expenseInCents);
    }
  });
});

describe("ledger-where: predicado único de período", () => {
  it("gera BETWEEN parametrizado e rejeita alias inválido", () => {
    const sql = periodPredicate("t", "2026-10-01", "2026-10-31");
    expect(sql.sql).toContain('"competenceOn" BETWEEN');
    expect(sql.values).toEqual(["2026-10-01", "2026-10-31"]);
    expect(() => periodPredicate("t; DROP", "a", "b")).toThrow();
  });
});
