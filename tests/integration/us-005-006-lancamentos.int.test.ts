import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;

async function cat(name: string, family = fx.family.id): Promise<string> {
  return (await db.category.findFirstOrThrow({ where: { familyId: family, name } })).id;
}

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
});

const post = (as: ReturnType<typeof lucas>, body: Record<string, unknown>, opts = {}) =>
  withClock(NOW, () => call(as, "POST", "/api/v1/transactions", body, opts));

const expense = async (over: Record<string, unknown> = {}) => ({
  type: "EXPENSE",
  accountId: nubank.id,
  categoryId: await cat("Supermercado"),
  amountInCents: 15050,
  ...over,
});

const balanceOf = async (as: ReturnType<typeof lucas>, id = nubank.id) => {
  const res = await call(as, "GET", "/api/v1/accounts");
  return res.body.items.find((a: { id: string }) => a.id === id).balanceInCents as number;
};

describe("US-005 Despesa comum com sucesso", () => {
  it("201, autor/pagador Lucas, data de hoje, comum, saldo 84950 e revisão CREATE", async () => {
    const res = await post(lucas(), await expense());
    expect(res.status).toBe(201);
    expect(res.body.account).toEqual({ id: nubank.id, balanceInCents: 84950 });
    expect(res.body.transaction).toMatchObject({
      type: "EXPENSE",
      direction: "DEBIT",
      amountInCents: 15050,
      occurredOn: "2026-10-04",
      description: "Supermercado",
      isSharedExpense: true,
      version: 1,
      account: { id: nubank.id, name: "Nubank Conjunta" },
      category: { name: "Supermercado", kind: "EXPENSE" },
      author: { id: fx.byName.Lucas?.memberId, name: "Lucas Silva" },
      payer: { id: fx.byName.Lucas?.memberId },
      deletedAt: null,
    });
    expect(await balanceOf(lucas())).toBe(84950);

    const row = await db.transaction.findUniqueOrThrow({ where: { id: res.body.transaction.id } });
    expect(row.authorMemberId).toBe(fx.byName.Lucas?.memberId);
    const revs = await db.transactionRevision.findMany({ where: { transactionId: row.id } });
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({
      action: "CREATE",
      revision: 1,
      actorMemberId: fx.byName.Lucas?.memberId,
    });
  });
});

describe("US-005 Registrar em nome de outro membro", () => {
  it("payerMemberId=Mariana: autor Lucas, pagador Mariana", async () => {
    const res = await post(
      lucas(),
      await expense({ amountInCents: 35000, payerMemberId: fx.byName.Mariana?.memberId }),
    );
    expect(res.status).toBe(201);
    expect(res.body.transaction.author.id).toBe(fx.byName.Lucas?.memberId);
    expect(res.body.transaction.payer).toMatchObject({
      id: fx.byName.Mariana?.memberId,
      name: "Mariana Silva",
    });
  });
});

describe("US-005 Despesa pessoal", () => {
  it("isSharedExpense=false persiste", async () => {
    const res = await post(
      lucas(),
      await expense({
        amountInCents: 8000,
        categoryId: await cat("Lazer e restaurantes"),
        isSharedExpense: false,
      }),
    );
    expect(res.body.transaction.isSharedExpense).toBe(false);
    const row = await db.transaction.findUniqueOrThrow({ where: { id: res.body.transaction.id } });
    expect(row.isSharedExpense).toBe(false);
  });
});

describe("US-005 Valor obrigatório e positivo / Categoria obrigatória", () => {
  it.each([0, -5, 1.5])("valor %j: 400 e nada gravado", async (amountInCents) => {
    const res = await post(lucas(), await expense({ amountInCents }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Informe um valor maior que zero");
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
    expect(await balanceOf(lucas())).toBe(100000);
  });

  it("sem categoria: 400 'Escolha uma categoria'", async () => {
    const { categoryId: _c, ...body } = await expense();
    const res = await post(lucas(), body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: "categoryId",
      message: "Escolha uma categoria",
    });
  });
});

describe("US-005 Descrição omitida", () => {
  it("sem descrição: usa o nome da categoria; vazia e espaços também; 'a' é 400; informada é mantida", async () => {
    const transporte = await cat("Transporte");
    const a = await post(lucas(), await expense({ categoryId: transporte, amountInCents: 2000 }));
    expect(a.body.transaction.description).toBe("Transporte");
    const b = await post(lucas(), await expense({ categoryId: transporte, description: "" }));
    expect(b.body.transaction.description).toBe("Transporte");
    const c = await post(lucas(), await expense({ categoryId: transporte, description: "   " }));
    expect(c.body.transaction.description).toBe("Transporte");
    const d = await post(lucas(), await expense({ categoryId: transporte, description: "a" }));
    expect(d.status).toBe(400);
    const e = await post(
      lucas(),
      await expense({ categoryId: transporte, description: "Uber para o trabalho" }),
    );
    expect(e.body.transaction.description).toBe("Uber para o trabalho");
  });
});

describe("US-005 Duplo clique não duplica", () => {
  it("2 POST simultâneos com a mesma chave: 1 linha, saldo reduzido 1x, 2ª com Idempotent-Replay", async () => {
    const key = randomUUID();
    const body = await expense();
    const [a, b] = await Promise.all([
      post(lucas(), body, { idempotencyKey: key }),
      post(lucas(), body, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body).toEqual(b.body);
    expect([a, b].filter((r) => r.headers.get("idempotent-replay") === "true")).toHaveLength(1);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
    expect(await balanceOf(lucas())).toBe(84950);
  });

  it("mesma chave com corpo diferente: 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = randomUUID();
    await post(lucas(), await expense(), { idempotencyKey: key });
    const res = await post(lucas(), await expense({ amountInCents: 999 }), { idempotencyKey: key });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("US-005 Data retroativa e data futura", () => {
  it("ontem é aceito", async () => {
    const res = await post(lucas(), await expense({ occurredOn: "2026-10-03" }));
    expect(res.status).toBe(201);
    expect(res.body.transaction.occurredOn).toBe("2026-10-03");
  });

  it("amanhã: 422 FUTURE_DATE_NOT_ALLOWED com a mensagem exata", async () => {
    const res = await post(lucas(), await expense({ occurredOn: "2026-10-05" }));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: "FUTURE_DATE_NOT_ALLOWED",
      message: "Para contas futuras, use Despesa prevista",
    });
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
  });

  it("virada de dia em America/Sao_Paulo: 02:30 UTC do dia D ainda é D-1", async () => {
    const at = (iso: string, occurredOn: string) =>
      withClock(iso, async () =>
        call(lucas(), "POST", "/api/v1/transactions", await expense({ occurredOn })),
      );
    expect((await at("2026-10-05T02:30:00Z", "2026-10-05")).status).toBe(422); // em SP ainda é 04/10
    expect((await at("2026-10-05T02:30:00Z", "2026-10-04")).status).toBe(201);
    expect((await at("2026-10-05T03:00:00Z", "2026-10-05")).status).toBe(201); // meia-noite em SP
  });

  it("sem occurredOn: usa a data de hoje no fuso da família", async () => {
    const res = await withClock("2026-10-05T02:30:00Z", async () =>
      call(lucas(), "POST", "/api/v1/transactions", await expense()),
    );
    expect(res.body.transaction.occurredOn).toBe("2026-10-04");
  });
});

describe("US-005 (infra) Referências inválidas e .strict()", () => {
  it("conta, categoria e pagador de outra família: 422 INVALID_REFERENCE e nada gravado", async () => {
    const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const otherAccount = await makeAccount(other, {
      name: "Conta Souza",
      openingBalanceInCents: 500,
    });
    const otherCategory = await cat("Supermercado", other.family.id);
    const cases = [
      { accountId: otherAccount.id },
      { categoryId: otherCategory },
      { payerMemberId: other.members[0]?.memberId },
    ];
    for (const over of cases) {
      const res = await post(lucas(), await expense(over));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INVALID_REFERENCE");
      expect(res.body.error.details).toHaveLength(1);
    }
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
  });

  it("categoria de receita em despesa: 422 CATEGORY_KIND_MISMATCH", async () => {
    const res = await post(lucas(), await expense({ categoryId: await cat("Salário") }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_KIND_MISMATCH");
  });

  it("corpo com familyId/authorMemberId: 400", async () => {
    for (const over of [
      { familyId: fx.family.id },
      { authorMemberId: fx.byName.Mariana?.memberId },
    ]) {
      expect((await post(lucas(), await expense(over))).status).toBe(400);
    }
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
  });

  it("conta/categoria inexistente (uuid aleatório): 422", async () => {
    expect((await post(lucas(), await expense({ accountId: randomUUID() }))).status).toBe(422);
    expect((await post(lucas(), await expense({ categoryId: randomUUID() }))).status).toBe(422);
  });

  it("sem sessão 401; usuário sem família 403 NO_FAMILY", async () => {
    expect((await call(null, "POST", "/api/v1/transactions", await expense())).status).toBe(401);
    const { asUser } = await import("../support/factories");
    const loner = await asUser("sozinho@exemplo.com");
    expect(
      (await call(loner, "POST", "/api/v1/transactions", await expense())).body.error.code,
    ).toBe("NO_FAMILY");
  });
});

describe("US-005 (infra) Atomicidade", () => {
  it("falha ao gravar a revisão desfaz o lançamento e o saldo não muda", async () => {
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    const res = await post(lucas(), await expense());
    expect(res.status).toBe(500);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
    expect(await balanceOf(lucas())).toBe(100000);
  });
});

describe("US-005 (infra) Defaults e categorias", () => {
  it("defaults: sem lançamentos usa a conta de que é titular; depois a do último lançamento", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 0,
    });
    const d1 = await withClock(NOW, () => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(d1.body).toEqual({
      accountId: itau.id,
      cardId: null,
      payerMemberId: fx.byName.Lucas?.memberId,
      today: "2026-10-04",
      split: { available: true },
    });
    await post(lucas(), await expense()); // lança no Nubank
    const d2 = await call(lucas(), "GET", "/api/v1/transactions/defaults");
    expect(d2.body.accountId).toBe(nubank.id);
    const d3 = await call(mariana(), "GET", "/api/v1/transactions/defaults");
    expect(d3.body.accountId).toBe(nubank.id); // titular
  });

  it("defaults sem contas: accountId null", async () => {
    const empty = await makeFamily({ name: "Vazia", uniqueEmails: true });
    const res = await call(empty.members[0]?.as ?? null, "GET", "/api/v1/transactions/defaults");
    expect(res.body.accountId).toBeNull();
  });

  it("categorias: 8 de despesa e 3 de receita na ordem padrão; filtro por kind; isolamento", async () => {
    const all = await call(lucas(), "GET", "/api/v1/categories");
    expect(all.body.items).toHaveLength(11);
    const exp = await call(lucas(), "GET", "/api/v1/categories?kind=EXPENSE");
    expect(exp.body.items.map((c: { name: string }) => c.name)).toEqual([
      "Supermercado",
      "Moradia",
      "Contas e serviços",
      "Transporte",
      "Saúde",
      "Educação",
      "Lazer e restaurantes",
      "Outros",
    ]);
    const inc = await call(lucas(), "GET", "/api/v1/categories?kind=INCOME");
    expect(inc.body.items.map((c: { name: string }) => c.name)).toEqual([
      "Salário",
      "Rendimentos",
      "Outras receitas",
    ]);
    const bad = await call(lucas(), "GET", "/api/v1/categories?kind=OUTRO");
    expect(bad.status).toBe(400);
    const other = await makeFamily({ name: "Souza", uniqueEmails: true });
    const theirs = await call(other.members[0]?.as ?? null, "GET", "/api/v1/categories");
    const ours = new Set(all.body.items.map((c: { id: string }) => c.id));
    expect(theirs.body.items.some((c: { id: string }) => ours.has(c.id))).toBe(false);
  });
});

describe("US-006 Registrar salário e receitas", () => {
  const income = async (over: Record<string, unknown> = {}) => ({
    type: "INCOME",
    accountId: nubank.id,
    categoryId: await cat("Salário"),
    amountInCents: 500000,
    ...over,
  });

  it("receita 500000 sobre conta de 150000: saldo 650000, autor/pagador Mariana, não comum", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú Mariana",
      owner: "Mariana",
      openingBalanceInCents: 150000,
    });
    const res = await post(mariana(), await income({ accountId: itau.id }));
    expect(res.status).toBe(201);
    expect(res.body.account).toEqual({ id: itau.id, balanceInCents: 650000 });
    expect(res.body.transaction).toMatchObject({
      type: "INCOME",
      direction: "CREDIT",
      isSharedExpense: false,
      author: { id: fx.byName.Mariana?.memberId },
      payer: { id: fx.byName.Mariana?.memberId },
      description: "Salário",
    });
  });

  it("Receita em nome de outro membro: autor Lucas, recebedor Mariana", async () => {
    const res = await post(
      lucas(),
      await income({
        amountInCents: 30000,
        categoryId: await cat("Outras receitas"),
        payerMemberId: fx.byName.Mariana?.memberId,
      }),
    );
    expect(res.body.transaction.author.id).toBe(fx.byName.Lucas?.memberId);
    expect(res.body.transaction.payer.id).toBe(fx.byName.Mariana?.memberId);
  });

  it("isSharedExpense em receita: 400; categoria de despesa em receita: 422", async () => {
    expect((await post(lucas(), await income({ isSharedExpense: true }))).status).toBe(400);
    const res = await post(lucas(), await income({ categoryId: await cat("Supermercado") }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CATEGORY_KIND_MISMATCH");
  });

  it("valor inválido: 400", async () => {
    const res = await post(lucas(), await income({ amountInCents: 0 }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Informe um valor maior que zero");
  });

  it("duplo clique: 1 receita", async () => {
    const key = randomUUID();
    const body = await income();
    await Promise.all([
      post(lucas(), body, { idempotencyKey: key }),
      post(lucas(), body, { idempotencyKey: key }),
    ]);
    expect(await db.transaction.count({ where: { kind: "INCOME" } })).toBe(1);
    expect(await balanceOf(lucas())).toBe(600000);
  });

  it("data futura: 'A data da receita não pode ser futura'", async () => {
    const res = await post(lucas(), await income({ occurredOn: "2026-10-05" }));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("A data da receita não pode ser futura");
  });
});
