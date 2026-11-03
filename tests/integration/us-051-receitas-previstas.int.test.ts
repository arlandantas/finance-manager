import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
} from "../support/factories";

// US-051 (SDD-017 §8). Escrito conforme o SDD; NÃO executado nesta entrega (ver estado/previstas-series.md).
const db = testDb();
const NOW = "2026-10-12T15:00:00Z"; // hoje = 12/10/2026
let fx: FamilyFixture;
let itau: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const summary = (qs = "") => at(() => call(mariana(), "GET", `/api/v1/month-summary${qs}`));
const balance = async () => (await accountBalances(db as never, fx.family.id)).get(itau.id);
const incomeCat = async () =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Salário" } })).id;
const expenseCat = async () =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Moradia" } })).id;
const salary = (o: Partial<{ amount: number; dueOn: string; description: string }> = {}) =>
  makePlannedExpense(fx, {
    kind: "INCOME",
    description: o.description ?? "Salário",
    amountInCents: o.amount ?? 500000,
    dueOn: o.dueOn ?? "2026-10-20",
    responsible: "Mariana",
  });
const receive = (id: string, body: Record<string, unknown> = {}, as = mariana(), version = 1) =>
  at(() =>
    call(as, "POST", `/api/v1/planned-expenses/${id}/pay`, {
      version,
      accountId: itau.id,
      ...body,
    }),
  );

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 734950,
  });
});

describe("US-051 cadastro", () => {
  it("POST kind INCOME => 201; saldo e extrato inalterados", async () => {
    const res = await at(async () =>
      call(mariana(), "POST", "/api/v1/planned-expenses", {
        kind: "INCOME",
        description: "Salário",
        amountInCents: 500000,
        dueOn: "2026-10-20",
        categoryId: await incomeCat(),
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.plannedExpense).toMatchObject({ kind: "INCOME", isSharedExpense: false });
    expect(await balance()).toBe(734950);
    expect(await db.transaction.count({ where: { kind: { in: ["INCOME", "EXPENSE"] } } })).toBe(0);
  });

  it("receita dividida => 400 'Receita não é dividida'; valor 0 => 400", async () => {
    const body = {
      kind: "INCOME",
      description: "Salário",
      amountInCents: 500000,
      categoryId: await incomeCat(),
    };
    const a = await at(() =>
      call(mariana(), "POST", "/api/v1/planned-expenses", { ...body, isSharedExpense: true }),
    );
    expect(a.status).toBe(400);
    expect(a.body.error.message).toBe("Receita não é dividida");
    const b = await at(() =>
      call(mariana(), "POST", "/api/v1/planned-expenses", { ...body, amountInCents: 0 }),
    );
    expect(b.status).toBe(400);
    expect(b.body.error.message).toBe("Informe um valor maior que zero");
  });

  it("categoria de despesa em receita prevista => 422 INVALID_REFERENCE", async () => {
    const res = await at(async () =>
      call(mariana(), "POST", "/api/v1/planned-expenses", {
        kind: "INCOME",
        description: "Salário",
        amountInCents: 500000,
        categoryId: await expenseCat(),
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
  });

  it("PATCH com kind => 400; CHECK do banco recusa receita dividida", async () => {
    const p = await salary();
    const res = await at(() =>
      call(mariana(), "PATCH", `/api/v1/planned-expenses/${p.id}`, { version: 1, kind: "EXPENSE" }),
    );
    expect(res.status).toBe(400);
    await expect(
      db.plannedExpense.update({ where: { id: p.id }, data: { isSharedExpense: true } }),
    ).rejects.toThrow();
  });
});

describe("US-051 listas e A pagar", () => {
  it("GET /planned-expenses: padrão EXPENSE; kind=INCOME e ALL", async () => {
    await salary();
    await makePlannedExpense(fx, {
      description: "Internet",
      amountInCents: 1000,
      dueOn: "2026-10-20",
    });
    const def = await at(() => call(mariana(), "GET", "/api/v1/planned-expenses?period=2026-10"));
    expect(def.body.items.map((i: { description: string }) => i.description)).toEqual(["Internet"]);
    const inc = await at(() =>
      call(mariana(), "GET", "/api/v1/planned-expenses?period=2026-10&kind=INCOME"),
    );
    expect(inc.body.items.map((i: { description: string }) => i.description)).toEqual(["Salário"]);
    const all = await at(() =>
      call(mariana(), "GET", "/api/v1/planned-expenses?period=2026-10&kind=ALL"),
    );
    expect(all.body.items).toHaveLength(2);
  });

  it("A pagar idêntico com e sem receita prevista", async () => {
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 125890,
      dueOn: "2026-10-20",
    });
    const before = await at(() => call(mariana(), "GET", "/api/v1/payables"));
    await salary();
    const after = await at(() => call(mariana(), "GET", "/api/v1/payables"));
    expect(after.body.totals).toEqual(before.body.totals);
    expect(after.body.items).toHaveLength(before.body.items.length);
  });

  it("GET /receivables: atrasada destacada; mês seguinte não lista atrasada", async () => {
    await salary({ description: "Freelance", amount: 80000, dueOn: "2026-10-05" });
    const cur = await at(() => call(mariana(), "GET", "/api/v1/receivables"));
    expect(cur.body.items[0]).toMatchObject({ title: "Freelance", isOverdue: true });
    expect(cur.body.totals).toMatchObject({ dueInCents: 80000, overdueCount: 1 });
    const next = await at(() => call(mariana(), "GET", "/api/v1/receivables?period=2026-11"));
    expect(next.body.items).toEqual([]);
  });
});

describe("US-051 Resumo do Mês e saldo previsto", () => {
  it("com receita: toReceive 500000, saldo previsto soma, receita pendente fora de incomeInCents", async () => {
    await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 125890,
      dueOn: "2026-10-20",
    });
    const without = (await summary()).body;
    expect(without.toReceive).toBeNull();
    expect(without.projectedBalanceInCents).toBe(734950 - 125890);
    expect(without.projectedBalanceFormula).toBe("SALDO_ATUAL_MENOS_A_PAGAR");
    await salary();
    const b = (await summary()).body;
    expect(b.toReceive.totalInCents).toBe(500000);
    expect(b.projectedBalanceInCents).toBe(734950 - 125890 + 500000);
    expect(b.projectedBalanceFormula).toBe("SALDO_ATUAL_MENOS_A_PAGAR_MAIS_A_RECEBER");
    expect(b.incomeInCents).toBe(without.incomeInCents);
    expect(b.toPay.totalInCents).toBe(125890);
  });

  it("mês futuro: saldo atual - a pagar(mês) + a receber(mês)", async () => {
    await salary({ dueOn: "2026-11-05", amount: 300000 });
    const b = (await summary("?period=2026-11")).body;
    expect(b.toReceive.totalInCents).toBe(300000);
    expect(b.projectedBalanceInCents).toBe(734950 + 300000);
  });
});

describe("US-051 Receber", () => {
  it("valor efetivo diferente: receita 510000, saldo +510000, diferença +10000, extrato mostra", async () => {
    const p = await salary();
    const res = await receive(p.id, { amountInCents: 510000, paidOn: "2026-10-12" });
    expect(res.status).toBe(201);
    expect(res.body.plannedExpense.paid).toMatchObject({
      amountInCents: 510000,
      differenceInCents: 10000,
    });
    expect(await balance()).toBe(734950 + 510000);
    const t = await db.transaction.findFirstOrThrow({
      where: { kind: "INCOME" },
      include: { paidPlanned: true },
    });
    expect(t.amountInCents).toBe(510000n);
    expect(t.paidPlanned?.kind).toBe("INCOME");
    const ext = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(ext.body.totals.incomeInCents).toBe(510000);
    const s = (await summary()).body;
    expect(s.incomeInCents).toBe(510000);
    expect(s.toReceive).toBeNull();
  });

  it("não entra no acerto", async () => {
    const before = await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-10"));
    const p = await salary();
    await receive(p.id);
    const after = await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-10"));
    expect(after.body).toEqual(before.body);
  });

  it("desfazer recebimento: UNDONE, volta a PREVISTO, saldo volta", async () => {
    const p = await salary();
    await receive(p.id);
    const res = await at(() =>
      call(mariana(), "POST", `/api/v1/planned-expenses/${p.id}/undo-payment`, { version: 2 }),
    );
    expect(res.status).toBe(200);
    expect(res.body.plannedExpense.status).toBe("PREVISTO");
    expect(await balance()).toBe(734950);
    const t = await db.transaction.findFirstOrThrow({ where: { kind: "INCOME" } });
    expect(t.deletionReason).toBe("UNDONE");
    const again = await at(() =>
      call(mariana(), "POST", `/api/v1/planned-expenses/${p.id}/undo-payment`, { version: 3 }),
    );
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("Esta receita prevista não foi recebida");
  });

  it("baixa única e concorrência: 1 receita gerada", async () => {
    const p = await salary();
    const [a, b] = await Promise.all([receive(p.id), receive(p.id)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.transaction.count({ where: { kind: "INCOME" } })).toBe(1);
    const c = await receive(p.id, {}, mariana(), 2);
    expect(c.status).toBe(409);
    expect(c.body.error.message).toBe("Esta receita prevista já foi recebida");
  });

  it("data futura => 422 com a mensagem do recebimento", async () => {
    const p = await salary();
    const res = await receive(p.id, { paidOn: "2026-10-13" });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("A data do recebimento não pode ser futura");
  });

  it("LINKED_TO_PLANNED na receita gerada (excluir e restaurar)", async () => {
    const p = await salary();
    const r = await receive(p.id);
    const tid = r.body.transaction.id;
    const del = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${tid}/delete`, {
        version: r.body.transaction.version,
      }),
    );
    expect(del.status).toBe(422);
    expect(del.body.error.message).toBe(
      "Esta receita veio de uma receita prevista. Use Desfazer recebimento.",
    );
    const res = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${tid}/restore`, {
        version: r.body.transaction.version,
      }),
    );
    expect(res.status).toBe(422);
  });

  it("categoria arquivada depois ainda recebe", async () => {
    const p = await salary();
    await db.category.update({
      where: { id: await incomeCat() },
      data: { archivedAt: new Date() },
    });
    expect((await receive(p.id)).status).toBe(201);
  });
});

describe("US-051 regras 'Só meu' e isolamento", () => {
  it("outro membro não edita nem recebe a receita 'Só meu' de Mariana (403)", async () => {
    const p = await salary();
    const e = await at(() =>
      call(lucas(), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: 1,
        amountInCents: 1000,
      }),
    );
    expect(e.status).toBe(403);
    const r = await receive(p.id, {}, lucas());
    expect(r.status).toBe(403);
    expect(await balance()).toBe(734950);
  });

  it("Lucas não cria receita em nome de Mariana (PERSONAL_ON_BEHALF)", async () => {
    const res = await at(async () =>
      call(lucas(), "POST", "/api/v1/planned-expenses", {
        kind: "INCOME",
        description: "Salário",
        amountInCents: 1000,
        categoryId: await incomeCat(),
        responsibleMemberId: fx.byName.Mariana?.memberId,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("outra família: GET/pay => 404 e /receivables só lista a própria", async () => {
    const p = await salary();
    const other = await makeFamily({
      name: "Família Souza",
      uniqueEmails: true,
      members: [{ email: "x@exemplo.com", name: "Souza" }],
    });
    const as = other.byName.Souza?.as ?? null;
    expect((await at(() => call(as, "GET", `/api/v1/planned-expenses/${p.id}`))).status).toBe(404);
    expect(
      (
        await at(() =>
          call(as, "POST", `/api/v1/planned-expenses/${p.id}/pay`, {
            version: 1,
            accountId: itau.id,
          }),
        )
      ).status,
    ).toBe(404);
    expect((await at(() => call(as, "GET", "/api/v1/receivables"))).body.items).toEqual([]);
  });
});
