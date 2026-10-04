import { beforeEach, describe, expect, it } from "vitest";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
  makeTransfer,
} from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
let nubank: AccountFixture;
let itau: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;

type Item = {
  id: string;
  type: string;
  amountInCents: number;
  occurredOn: string;
  description: string;
  isSharedExpense: boolean;
  deletedAt: string | null;
  deletionReason: string | null;
  transferGroupId: string | null;
  counterpartAccount: { id: string; name: string } | null;
  isSettlement: boolean;
  payer: { name: string } | null;
  author: { name: string };
  category: { name: string } | null;
  account: { name: string };
};

const list = (as: ReturnType<typeof lucas>, qs = "") =>
  call(as, "GET", `/api/v1/transactions${qs ? `?${qs}` : ""}`);

// Contexto comum (SDD-005 §6): outubro com despesa comum 15050 (Lucas, Supermercado, Nubank),
// despesa pessoal 8000 (Mariana, Lazer e restaurantes) e receita 500000 (Mariana, Salário).
async function seedOctober() {
  const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, n));
  await makeTransaction(fx, {
    account: nubank,
    category: "Supermercado",
    amountInCents: 15050,
    occurredOn: "2026-10-02",
    author: "Lucas",
    payer: "Lucas",
    createdAt: t(1),
  });
  await makeTransaction(fx, {
    account: nubank,
    category: "Lazer e restaurantes",
    amountInCents: 8000,
    occurredOn: "2026-10-03",
    author: "Mariana",
    payer: "Mariana",
    shared: false,
    createdAt: t(2),
  });
  await makeTransaction(fx, {
    account: itau,
    type: "INCOME",
    category: "Salário",
    amountInCents: 500000,
    occurredOn: "2026-10-04",
    author: "Mariana",
    payer: "Mariana",
    createdAt: t(3),
  });
}

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
  itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 150000,
  });
});

describe("US-007 Extrato padrão", () => {
  it("3 itens de outubro, do mais recente ao mais antigo, sem OPENING, com todos os campos", async () => {
    await seedOctober();
    const res = await list(lucas(), "period=2026-10");
    expect(res.status).toBe(200);
    const items = res.body.items as Item[];
    expect(items.map((i) => i.description)).toEqual([
      "Salário",
      "Lazer e restaurantes",
      "Supermercado",
    ]);
    expect(items.map((i) => i.occurredOn)).toEqual(["2026-10-04", "2026-10-03", "2026-10-02"]);
    expect(items.every((i) => i.type !== "OPENING")).toBe(true);
    expect(items[2]).toMatchObject({
      type: "EXPENSE",
      amountInCents: 15050,
      isSharedExpense: true,
      category: { name: "Supermercado" },
      account: { name: "Nubank Conjunta" },
      payer: { name: "Lucas Silva" },
      author: { name: "Lucas Silva" },
    });
    expect(items[1]?.isSharedExpense).toBe(false);
    expect(res.body.period).toEqual({ key: "2026-10", start: "2026-10-01", end: "2026-10-31" });
    expect(res.body.totals).toEqual({
      incomeInCents: 500000,
      expenseInCents: 23050,
      balanceInCents: 476950,
      count: 3,
    });
    expect(res.body.hasAnyTransactions).toBe(true);
    expect(res.body.nextCursor).toBeNull();
  });

  it("sem parâmetros usa o período corrente (relógio da aplicação)", async () => {
    await seedOctober();
    const { withClock } = await import("@/lib/clock");
    const res = await withClock("2026-10-15T15:00:00Z", () => list(lucas()));
    expect(res.body.period.key).toBe("2026-10");
    expect(res.body.items).toHaveLength(3);
  });
});

describe("US-007 Filtrar por membro", () => {
  it("memberId casa pagador OU autor", async () => {
    await seedOctober();
    // "Lucas registrou despesa paga por Mariana" e "Mariana registrou despesa paga por Lucas"
    await makeTransaction(fx, {
      account: nubank,
      category: "Transporte",
      amountInCents: 1000,
      occurredOn: "2026-10-04",
      author: "Lucas",
      payer: "Mariana",
      description: "Lucas registrou, Mariana pagou",
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Saúde",
      amountInCents: 2000,
      occurredOn: "2026-10-04",
      author: "Mariana",
      payer: "Lucas",
      description: "Mariana registrou, Lucas pagou",
    });
    const res = await list(lucas(), `period=2026-10&memberId=${fx.byName.Lucas?.memberId}`);
    const names = (res.body.items as Item[]).map((i) => i.description);
    expect(names).toEqual(
      expect.arrayContaining([
        "Supermercado",
        "Lucas registrou, Mariana pagou",
        "Mariana registrou, Lucas pagou",
      ]),
    );
    expect(names).not.toContain("Salário");
    expect(names).not.toContain("Lazer e restaurantes");
    expect(names).toHaveLength(3);
  });
});

describe("US-007 Filtrar por categoria e tipo", () => {
  it("Supermercado + Despesa: 1 item e totais coerentes", async () => {
    await seedOctober();
    const category = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Supermercado" },
    });
    const res = await list(lucas(), `period=2026-10&categoryId=${category.id}&type=EXPENSE`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.totals).toMatchObject({
      expenseInCents: 15050,
      incomeInCents: 0,
      balanceInCents: -15050,
      count: 1,
    });
  });
});

describe("US-007 Filtrar por período", () => {
  it("30/09 e 01/10 caem em meses diferentes (DATE, sem deslocamento de fuso)", async () => {
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: "2026-09-30",
      description: "setembro",
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 200,
      occurredOn: "2026-10-01",
      description: "outubro",
    });
    const sep = await list(lucas(), "period=2026-09");
    expect((sep.body.items as Item[]).map((i) => i.description)).toEqual(["setembro"]);
    const oct = await list(lucas(), "period=2026-10");
    expect((oct.body.items as Item[]).map((i) => i.description)).toEqual(["outubro"]);
  });

  it("from/to inclusivos; period vira null", async () => {
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: "2026-09-30",
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 200,
      occurredOn: "2026-10-01",
    });
    const res = await list(lucas(), "from=2026-09-30&to=2026-10-01");
    expect(res.body.items).toHaveLength(2);
    expect(res.body.period).toBeNull();
  });
});

describe("US-007 Detalhe mostra o autor", () => {
  it("GET /transactions/:id traz autor Lucas e pagador Mariana", async () => {
    const t = await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 35000,
      occurredOn: "2026-10-02",
      author: "Lucas",
      payer: "Mariana",
    });
    const res = await call(lucas(), "GET", `/api/v1/transactions/${t.id}`);
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      id: t.id,
      author: { name: "Lucas Silva" },
      payer: { name: "Mariana Silva" },
      editedBy: null,
      version: 1,
      note: null,
    });
  });

  it("id inexistente ou malformado: 404", async () => {
    expect(
      (await call(lucas(), "GET", "/api/v1/transactions/00000000-0000-4000-8000-000000000000"))
        .status,
    ).toBe(404);
    expect((await call(lucas(), "GET", "/api/v1/transactions/xyz")).status).toBe(404);
  });
});

describe("US-007 Estado vazio", () => {
  it("com filtro sem resultados: items [] e hasAnyTransactions true", async () => {
    await seedOctober();
    const res = await list(
      lucas(),
      "period=2026-10&memberId=" + fx.byName.Lucas?.memberId + "&type=INCOME",
    );
    expect(res.body.items).toEqual([]);
    expect(res.body.hasAnyTransactions).toBe(true);
    expect(res.body.totals).toMatchObject({ count: 0, balanceInCents: 0 });
  });

  it("família sem lançamentos: hasAnyTransactions false (a abertura não conta)", async () => {
    const res = await list(lucas(), "period=2026-10");
    expect(res.body.items).toEqual([]);
    expect(res.body.hasAnyTransactions).toBe(false);
  });
});

describe("US-007 Isolamento entre famílias", () => {
  it("Família B não vê, não filtra por conta alheia e recebe 404 no detalhe", async () => {
    await seedOctober();
    const b = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const asB = b.members[0]?.as ?? null;
    const mine = await list(asB, "period=2026-10");
    expect(mine.body.items).toEqual([]);
    expect(mine.body.hasAnyTransactions).toBe(false);
    const byForeignAccount = await list(asB, `period=2026-10&accountId=${nubank.id}`);
    expect(byForeignAccount.status).toBe(200);
    expect(byForeignAccount.body.items).toEqual([]);
    const foreign = await db.transaction.findFirstOrThrow({
      where: { familyId: fx.family.id, kind: "EXPENSE" },
    });
    expect((await call(asB, "GET", `/api/v1/transactions/${foreign.id}`)).status).toBe(404);
  });

  it("sem sessão 401; sem família 403", async () => {
    expect((await list(null)).status).toBe(401);
    expect((await list(await asUser("solo@exemplo.com"))).body.error.code).toBe("NO_FAMILY");
  });
});

describe("US-007 (infra) Paginação keyset", () => {
  it("120 lançamentos com mesmo occurredOn e createdAt: sem duplicata nem omissão, ordem estável", async () => {
    const sameInstant = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
    for (let i = 0; i < 120; i++) {
      await makeTransaction(fx, {
        account: nubank,
        category: "Supermercado",
        amountInCents: 100 + i,
        occurredOn: i % 2 === 0 ? "2026-10-05" : "2026-10-04",
        createdAt: sameInstant,
        description: `item ${i}`,
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = `period=2026-10&limit=25${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await list(lucas(), qs);
      expect(res.status).toBe(200);
      seen.push(...(res.body.items as Item[]).map((i) => i.id));
      if (pages > 0) {
        expect(res.body.totals).toBeNull();
        expect(res.body.hasAnyTransactions).toBeNull();
      } else {
        expect(res.body.totals.count).toBe(120);
      }
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(5);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    const expected = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM transactions WHERE kind = 'EXPENSE'
      ORDER BY "occurredOn" DESC, "createdAt" DESC, id DESC`;
    expect(seen).toEqual(expected.map((r) => r.id));
  });

  it("limit=101 e cursor adulterado: 400", async () => {
    expect((await list(lucas(), "limit=101")).status).toBe(400);
    expect((await list(lucas(), "limit=0")).status).toBe(400);
    const bad = await list(lucas(), "cursor=%7Bnao-e-base64");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: "INVALID_CURSOR", message: "Cursor inválido" });
    const wrongShape = Buffer.from(JSON.stringify({ d: "2026-10-01", c: "x", i: "y" })).toString(
      "base64url",
    );
    expect((await list(lucas(), `cursor=${wrongShape}`)).body.error.code).toBe("INVALID_CURSOR");
  });
});

describe("US-007 (infra) Totais coerentes com a lista", () => {
  it("Σ dos itens ativos em todas as páginas == totals, para várias combinações de filtro", async () => {
    await seedOctober();
    for (let i = 0; i < 40; i++) {
      await makeTransaction(fx, {
        account: i % 2 ? nubank : itau,
        type: i % 3 === 0 ? "INCOME" : "EXPENSE",
        category: i % 3 === 0 ? "Rendimentos" : "Transporte",
        amountInCents: 1000 + i * 7,
        occurredOn: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
        author: i % 2 ? "Lucas" : "Mariana",
        payer: i % 4 ? "Mariana" : "Lucas",
        shared: i % 5 !== 0,
        deleted: i % 11 === 0,
      });
    }
    const combos = [
      "",
      `accountId=${nubank.id}`,
      `memberId=${fx.byName.Lucas?.memberId}`,
      "type=EXPENSE",
      "type=INCOME",
      "shared=true",
      "shared=false",
      `accountId=${itau.id}&type=EXPENSE&shared=true`,
      "includeDeleted=true",
    ];
    for (const combo of combos) {
      const all: Item[] = [];
      let cursor: string | null = null;
      let totals: {
        incomeInCents: number;
        expenseInCents: number;
        balanceInCents: number;
        count: number;
      } | null = null;
      do {
        const qs = ["period=2026-10", "limit=7", combo, cursor ? `cursor=${cursor}` : ""]
          .filter(Boolean)
          .join("&");
        const res = await list(lucas(), qs);
        expect(res.status).toBe(200);
        totals ??= res.body.totals;
        all.push(...res.body.items);
        cursor = res.body.nextCursor;
      } while (cursor);
      const active = all.filter((i) => i.deletedAt === null);
      const income = active
        .filter((i) => i.type === "INCOME")
        .reduce((s, i) => s + i.amountInCents, 0);
      const expense = active
        .filter((i) => i.type === "EXPENSE")
        .reduce((s, i) => s + i.amountInCents, 0);
      expect(totals, combo).toMatchObject({
        incomeInCents: income,
        expenseInCents: expense,
        balanceInCents: income - expense,
        count: all.length,
      });
    }
  });

  it("transferência, acerto, abertura e excluído não entram nos totais; type=TRANSFER zera os totais", async () => {
    await seedOctober();
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 100000,
      occurredOn: "2026-10-04",
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 40000,
      occurredOn: "2026-10-04",
      kind: "SETTLEMENT",
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Moradia",
      amountInCents: 999999,
      occurredOn: "2026-10-04",
      deleted: true,
    });
    const res = await list(lucas(), "period=2026-10");
    expect(res.body.totals).toMatchObject({ incomeInCents: 500000, expenseInCents: 23050 });
    const onlyTransfers = await list(lucas(), "period=2026-10&type=TRANSFER");
    expect(onlyTransfers.body.totals).toMatchObject({
      incomeInCents: 0,
      expenseInCents: 0,
      balanceInCents: 0,
      count: 4,
    });
    const legs = onlyTransfers.body.items as Item[];
    expect(legs).toHaveLength(4);
    expect(legs.filter((l) => l.isSettlement)).toHaveLength(2);
    const [out] = legs.filter((l) => l.type === "TRANSFER_OUT");
    expect(out?.transferGroupId).toBeTruthy();
    expect(out?.counterpartAccount).toMatchObject({ name: "Nubank Conjunta" });
  });
});

describe("US-007 (infra) includeDeleted e filtro comum/pessoal", () => {
  it("excluídos aparecem com deletedAt/deletionReason; transferência desfeita como UNDONE", async () => {
    await seedOctober();
    await makeTransaction(fx, {
      account: nubank,
      category: "Moradia",
      amountInCents: 5000,
      occurredOn: "2026-10-04",
      deleted: true,
      description: "apagada",
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 1000,
      occurredOn: "2026-10-04",
      undone: true,
    });
    const hidden = await list(lucas(), "period=2026-10");
    expect((hidden.body.items as Item[]).some((i) => i.description === "apagada")).toBe(false);
    expect((hidden.body.items as Item[]).some((i) => i.transferGroupId)).toBe(false);
    const shown = await list(lucas(), "period=2026-10&includeDeleted=true");
    const items = shown.body.items as Item[];
    expect(items.find((i) => i.description === "apagada")).toMatchObject({
      deletionReason: "DELETED",
    });
    expect(items.filter((i) => i.deletionReason === "UNDONE")).toHaveLength(2);
    expect(shown.body.totals.expenseInCents).toBe(23050); // excluídos fora dos totais
  });

  it("shared=true/false restringe a despesas", async () => {
    await seedOctober();
    const common = await list(lucas(), "period=2026-10&shared=true");
    expect((common.body.items as Item[]).map((i) => i.description)).toEqual(["Supermercado"]);
    const personal = await list(lucas(), "period=2026-10&shared=false");
    expect((personal.body.items as Item[]).map((i) => i.description)).toEqual([
      "Lazer e restaurantes",
    ]);
  });
});

describe("US-007 (infra) Parâmetros inválidos", () => {
  it.each([
    ["period=2026-10&from=2026-10-01&to=2026-10-02", "Use period ou from/to, não ambos"],
    ["from=2026-10-01", "Informe from e to juntos"],
    ["from=2026-10-10&to=2026-10-01", "Intervalo inválido"],
    ["from=2025-01-01&to=2026-10-01", "Intervalo inválido"],
    ["period=2026-13", "Período inválido"],
    ["type=OUTRO", ""],
    ["foo=bar", ""],
  ])("%s => 400", async (qs, message) => {
    const res = await list(lucas(), qs);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    if (message) expect(res.body.error.message).toBe(message);
  });
});

describe("US-007 (infra) Consulta paginada usa o índice do ledger", () => {
  it("EXPLAIN da consulta cita a tabela e o índice (informativo)", async () => {
    await seedOctober();
    const plan = await db.$queryRawUnsafe<Array<Record<string, string>>>(
      `EXPLAIN SELECT t.id FROM transactions t WHERE t."familyId" = '${fx.family.id}'::uuid AND t.kind <> 'OPENING'
       AND t."deletedAt" IS NULL ORDER BY t."occurredOn" DESC, t."createdAt" DESC, t.id DESC LIMIT 31`,
    );
    const text = plan.map((r) => Object.values(r)[0]).join("\n");
    expect(text).toContain("transactions");
    console.info("EXPLAIN extrato:\n" + text);
  });
});
