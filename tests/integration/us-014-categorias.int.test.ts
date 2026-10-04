import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as idempotency from "@/lib/api/idempotency";
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
let fx: FamilyFixture;
let nubank: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  nubank = await makeAccount(fx, { name: "Nubank", openingBalanceInCents: 500000 });
});

const create = (as: ReturnType<typeof lucas>, body: Record<string, unknown>, opts = {}) =>
  call(as, "POST", "/api/v1/categories", body, opts);
const patch = (as: ReturnType<typeof lucas>, id: string, body: Record<string, unknown>) =>
  call(as, "PATCH", `/api/v1/categories/${id}`, body);
const state = (
  as: ReturnType<typeof lucas>,
  id: string,
  action: "archive" | "unarchive",
  version: number,
) => call(as, "POST", `/api/v1/categories/${id}/${action}`, { version });
const list = async (as: ReturnType<typeof lucas>, qs = "") =>
  (await call(as, "GET", `/api/v1/categories${qs}`)).body.items as Array<{
    id: string;
    name: string;
    archived: boolean;
    version: number;
    kind: string;
  }>;
const byName = async (name: string, kind = "EXPENSE") =>
  db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name, kind: kind as never } });

describe("US-014 Criar categoria de despesa", () => {
  it("POST => 201, version 1, sortOrder = max + 1, aparece por último em GET ?kind=EXPENSE", async () => {
    const maxBefore = (
      await db.category.aggregate({ where: { familyId: fx.family.id }, _max: { sortOrder: true } })
    )._max.sortOrder as number;
    const res = await create(lucas(), { kind: "EXPENSE", name: "Pet", icon: "paw-print" });
    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({
      name: "Pet",
      kind: "EXPENSE",
      icon: "paw-print",
      archived: false,
      version: 1,
    });
    const row = await db.category.findUniqueOrThrow({ where: { id: res.body.category.id } });
    expect(row.sortOrder).toBe(maxBefore + 1);
    expect(row.updatedByMemberId).toBe(fx.byName.Lucas?.memberId);
    const items = await list(lucas(), "?kind=EXPENSE");
    expect(items.at(-1)?.name).toBe("Pet");
    expect(items).toHaveLength(9);
  });

  it("usar a categoria nova em um lançamento => 201", async () => {
    const cat = await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    const tx = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: nubank.id,
      categoryId: cat.body.category.id,
      amountInCents: 12000,
    });
    expect(tx.status).toBe(201);
    expect(tx.body.transaction.category.name).toBe("Pet");
  });
});

describe("US-014 Nomes", () => {
  it("mesmo nome em tipos diferentes => 2x201", async () => {
    expect((await create(lucas(), { kind: "EXPENSE", name: "Presentes" })).status).toBe(201);
    expect((await create(lucas(), { kind: "INCOME", name: "Presentes" })).status).toBe(201);
  });

  it("duplicado ' supermercado ' => 409 com a mensagem exata", async () => {
    const res = await create(lucas(), { kind: "EXPENSE", name: " supermercado " });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_CATEGORY_NAME");
    expect(res.body.error.message).toBe("Já existe uma categoria com este nome");
    expect(await db.category.count({ where: { familyId: fx.family.id } })).toBe(11);
  });

  it("corrida (chaves diferentes, mesmo nome) => 1x201 e 1x409", async () => {
    const [a, b] = await Promise.all([
      create(lucas(), { kind: "EXPENSE", name: "Viagens" }),
      create(mariana(), { kind: "EXPENSE", name: "viagens" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await db.category.count({
        where: { familyId: fx.family.id, name: { in: ["Viagens", "viagens"] } },
      }),
    ).toBe(1);
  });

  it("igual ao de uma arquivada => 409 com details.archived", async () => {
    const pet = await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    await state(lucas(), pet.body.category.id, "archive", 1);
    const res = await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Já existe uma categoria arquivada com este nome");
    expect(res.body.error.details).toEqual({ archived: true, categoryId: pet.body.category.id });
  });

  it("nome curto/longo => 400 e nada criado", async () => {
    expect((await create(lucas(), { kind: "EXPENSE", name: "A" })).status).toBe(400);
    const long = await create(lucas(), { kind: "EXPENSE", name: "x".repeat(31) });
    expect(long.status).toBe(400);
    expect(long.body.error.message).toBe("O nome deve ter no máximo 30 caracteres");
    expect(await db.category.count({ where: { familyId: fx.family.id } })).toBe(11);
  });
});

describe("US-014 Renomear preserva o histórico", () => {
  it("PATCH name => 200, version 2; despesa lista a categoria com o nome novo; total por categoria igual", async () => {
    const cat = await byName("Supermercado");
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 15050,
      occurredOn: "2026-10-03",
    });
    const before = await call(
      lucas(),
      "GET",
      `/api/v1/transactions?period=2026-10&categoryId=${cat.id}`,
    );
    const res = await patch(lucas(), cat.id, { version: 1, name: "Mercado" });
    expect(res.status).toBe(200);
    expect(res.body.category).toMatchObject({ name: "Mercado", version: 2 });
    const after = await call(
      lucas(),
      "GET",
      `/api/v1/transactions?period=2026-10&categoryId=${cat.id}`,
    );
    expect(after.body.items[0].category.name).toBe("Mercado");
    expect(after.body.totals).toEqual(before.body.totals);
  });

  it("sem diferença efetiva => 200 sem mudar version; PATCH em arquivada => 422", async () => {
    const cat = await byName("Saúde");
    const same = await patch(lucas(), cat.id, { version: 1, name: "Saúde" });
    expect(same.status).toBe(200);
    expect(same.body.category.version).toBe(1);
    await state(lucas(), cat.id, "archive", 1);
    const res = await patch(lucas(), cat.id, { version: 2, name: "Saúde 2" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_ARCHIVED");
  });

  it("renomear para nome existente => 409", async () => {
    const cat = await byName("Saúde");
    const res = await patch(lucas(), cat.id, { version: 1, name: "moradia" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_CATEGORY_NAME");
  });

  it("conflito: dois PATCH com a mesma version => 1x200 e 1x409 'alterada por Mariana'", async () => {
    const cat = await byName("Transporte");
    const [a, b] = await Promise.all([
      patch(mariana(), cat.id, { version: 1, name: "Locomoção" }),
      patch(lucas(), cat.id, { version: 1, name: "Carro" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const winnerName = a.status === 200 ? "Mariana" : "Lucas";
    expect(loser.body.error.code).toBe("VERSION_CONFLICT");
    expect(loser.body.error.message).toBe(
      `Esta categoria foi alterada por ${winnerName}. Recarregue para continuar.`,
    );
    const row = await db.category.findUniqueOrThrow({ where: { id: cat.id } });
    expect(row.version).toBe(2);
  });

  it("conflito sequencial: Mariana renomeia, Lucas com a versão antiga => mensagem exata", async () => {
    const cat = await byName("Transporte");
    expect((await patch(mariana(), cat.id, { version: 1, name: "Locomoção" })).status).toBe(200);
    const res = await patch(lucas(), cat.id, { version: 1, name: "Carro" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "Esta categoria foi alterada por Mariana. Recarregue para continuar.",
    );
    expect((await byName("Locomoção")).version).toBe(2);
  });
});

describe("US-014 Arquivar e reativar", () => {
  it("arquivar categoria em uso: some do GET padrão, aparece com includeArchived; lançamento mantém; POST => 422; PATCH sem categoryId => 200", async () => {
    const cat = await byName("Lazer e restaurantes");
    const t = await makeTransaction(fx, {
      account: nubank,
      category: "Lazer e restaurantes",
      amountInCents: 8000,
      occurredOn: "2026-10-03",
    });
    const res = await state(lucas(), cat.id, "archive", 1);
    expect(res.status).toBe(200);
    expect(res.body.category).toMatchObject({ archived: true, version: 2 });
    expect((await list(lucas(), "?kind=EXPENSE")).map((c) => c.name)).not.toContain(
      "Lazer e restaurantes",
    );
    const all = await list(lucas(), "?kind=EXPENSE&includeArchived=true");
    expect(all.find((c) => c.name === "Lazer e restaurantes")?.archived).toBe(true);

    const kept = await call(lucas(), "GET", `/api/v1/transactions/${t.id}`);
    expect(kept.body.transaction.category).toMatchObject({
      name: "Lazer e restaurantes",
      archived: true,
    });
    const post = await call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: nubank.id,
      categoryId: cat.id,
      amountInCents: 1000,
    });
    expect(post.status).toBe(422);
    expect(post.body.error.code).toBe("INVALID_REFERENCE");
    const edit = await call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
      version: 1,
      amountInCents: 9000,
    });
    expect(edit.status).toBe(200);
    // mesmo enviando a categoria atual (arquivada), não é erro
    const same = await call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
      version: 2,
      categoryId: cat.id,
      amountInCents: 9500,
    });
    expect(same.status).toBe(200);
    // mas trocar PARA uma arquivada é erro
    const other = await byName("Saúde");
    await state(lucas(), other.id, "archive", 1);
    const to = await call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
      version: 3,
      categoryId: other.id,
    });
    expect(to.status).toBe(422);
  });

  it("repetir arquivar => 409 ALREADY_ARCHIVED; reativar volta ao GET; repetir => 409 NOT_ARCHIVED", async () => {
    const cat = await byName("Educação");
    expect((await state(lucas(), cat.id, "archive", 1)).status).toBe(200);
    const again = await state(lucas(), cat.id, "archive", 2);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_ARCHIVED");
    const un = await state(lucas(), cat.id, "unarchive", 2);
    expect(un.status).toBe(200);
    expect(un.body.category).toMatchObject({ archived: false, version: 3 });
    expect((await list(lucas(), "?kind=EXPENSE")).map((c) => c.name)).toContain("Educação");
    const rep = await state(lucas(), cat.id, "unarchive", 3);
    expect(rep.status).toBe(409);
    expect(rep.body.error.code).toBe("NOT_ARCHIVED");
  });

  it("versão antiga ao arquivar => 409 VERSION_CONFLICT", async () => {
    const cat = await byName("Educação");
    await patch(mariana(), cat.id, { version: 1, name: "Cursos" });
    const res = await state(lucas(), cat.id, "archive", 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("não arquivar a última do tipo: mensagem por tipo", async () => {
    const incomes = await db.category.findMany({
      where: { familyId: fx.family.id, kind: "INCOME" },
    });
    for (const c of incomes.slice(0, 2))
      expect((await state(lucas(), c.id, "archive", 1)).status).toBe(200);
    const last = incomes[2];
    const res = await state(lucas(), last?.id as string, "archive", 1);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("LAST_ACTIVE_CATEGORY");
    expect(res.body.error.message).toBe("Mantenha ao menos uma categoria de receita ativa");
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: last?.id as string } })).archivedAt,
    ).toBeNull();

    const expenses = await db.category.findMany({
      where: { familyId: fx.family.id, kind: "EXPENSE" },
    });
    for (const c of expenses.slice(0, 7)) await state(lucas(), c.id, "archive", 1);
    const lastExp = await state(lucas(), expenses[7]?.id as string, "archive", 1);
    expect(lastExp.body.error.message).toBe("Mantenha ao menos uma categoria de despesa ativa");
  });

  it("corrida de 2 arquivamentos com 2 ativas => 1x200 e 1x422 (sempre sobra 1)", async () => {
    const incomes = await db.category.findMany({
      where: { familyId: fx.family.id, kind: "INCOME" },
    });
    await state(lucas(), incomes[2]?.id as string, "archive", 1);
    const [a, b] = await Promise.all([
      state(lucas(), incomes[0]?.id as string, "archive", 1),
      state(mariana(), incomes[1]?.id as string, "archive", 1),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    expect(
      await db.category.count({
        where: { familyId: fx.family.id, kind: "INCOME", archivedAt: null },
      }),
    ).toBe(1);
  });
});

describe("US-014 Limite de categorias por tipo", () => {
  it("40 despesas (arquivadas contam) => 41ª => 422", async () => {
    const current = await db.category.count({ where: { familyId: fx.family.id, kind: "EXPENSE" } });
    const first = await create(lucas(), { kind: "EXPENSE", name: "Extra 0" });
    await state(lucas(), first.body.category.id, "archive", 1);
    await db.category.createMany({
      data: Array.from({ length: 40 - current - 1 }, (_, i) => ({
        familyId: fx.family.id,
        kind: "EXPENSE" as const,
        name: `Extra ${i + 1}`,
        icon: "package",
        sortOrder: 100 + i,
      })),
    });
    expect(await db.category.count({ where: { familyId: fx.family.id, kind: "EXPENSE" } })).toBe(
      40,
    );
    const res = await create(lucas(), { kind: "EXPENSE", name: "Mais uma" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_LIMIT_REACHED");
    expect(res.body.error.message).toBe("Limite de 40 categorias por tipo atingido");
    // receitas não são afetadas
    expect((await create(lucas(), { kind: "INCOME", name: "Receita extra" })).status).toBe(201);
  });
});

describe("US-014 Permissão, isolamento e infra", () => {
  it("membro comum (MEMBER) cria, renomeia e arquiva => 2xx", async () => {
    expect(fx.byName.Lucas?.role).toBe("MEMBER");
    const c = await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    expect(c.status).toBe(201);
    expect((await patch(lucas(), c.body.category.id, { version: 1, name: "Pets" })).status).toBe(
      200,
    );
    expect((await state(lucas(), c.body.category.id, "archive", 2)).status).toBe(200);
  });

  it("Isolamento: GET não lista, PATCH/archive/unarchive de outra família => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    const cat = await byName("Saúde");
    expect((await patch(b, cat.id, { version: 1, name: "Zzz" })).status).toBe(404);
    expect((await state(b, cat.id, "archive", 1)).status).toBe(404);
    expect((await state(b, cat.id, "unarchive", 1)).status).toBe(404);
    const mine = await list(b);
    expect(mine.map((c) => c.id)).not.toContain(cat.id);
    await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    expect((await list(b)).map((c) => c.name)).not.toContain("Pet");
  });

  it("Idempotência: Promise.all com a mesma chave => 1 categoria; mesma chave e corpo diferente => 422", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      create(lucas(), { kind: "EXPENSE", name: "Pet" }, { idempotencyKey: key }),
      create(lucas(), { kind: "EXPENSE", name: "Pet" }, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status].every((s) => s === 201)).toBe(true);
    expect(await db.category.count({ where: { familyId: fx.family.id, name: "Pet" } })).toBe(1);
    const reused = await create(
      lucas(),
      { kind: "EXPENSE", name: "Outro" },
      { idempotencyKey: key },
    );
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it(".strict(): familyId/archivedAt/sortOrder => 400; ícone fora da lista => 400", async () => {
    for (const extra of [
      { familyId: fx.family.id },
      { archivedAt: "2026-01-01" },
      { sortOrder: 1 },
    ]) {
      expect((await create(lucas(), { kind: "EXPENSE", name: "Pet", ...extra })).status).toBe(400);
    }
    expect((await create(lucas(), { kind: "EXPENSE", name: "Pet", icon: "banana" })).status).toBe(
      400,
    );
  });

  it("Atomicidade: falha após o INSERT => nada persiste", async () => {
    vi.spyOn(idempotency, "saveIdempotentResponse").mockRejectedValueOnce(
      new Error("falha injetada"),
    );
    const res = await create(lucas(), { kind: "EXPENSE", name: "Pet" });
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.category.count({ where: { familyId: fx.family.id, name: "Pet" } })).toBe(0);
  });

  it("Banco: índice funcional rejeita duplicata ignorando caixa/espaços (inclusive arquivadas)", async () => {
    await expect(
      db.category.create({
        data: {
          familyId: fx.family.id,
          kind: "EXPENSE",
          name: "  SUPERMERCADO ",
          icon: "package",
          sortOrder: 99,
        },
      }),
    ).rejects.toThrow();
  });

  it("filtro do extrato aceita categoria arquivada", async () => {
    const cat = await byName("Saúde");
    await makeTransaction(fx, {
      account: nubank,
      category: "Saúde",
      amountInCents: 5000,
      occurredOn: "2026-10-02",
    });
    await state(lucas(), cat.id, "archive", 1);
    const res = await call(
      lucas(),
      "GET",
      `/api/v1/transactions?period=2026-10&categoryId=${cat.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});
