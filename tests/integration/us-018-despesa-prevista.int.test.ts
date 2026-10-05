import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as idempotency from "@/lib/api/idempotency";
import { setDevClockOverride } from "@/lib/clock";
import { accountBalances } from "@/modules/contas/ledger-queries";
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
  makeInvoicePayment,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-28T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
let moradia: string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  moradia = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Moradia" } })
  ).id;
});

const create = (as: ReturnType<typeof lucas>, body: Record<string, unknown> = {}, opts = {}) =>
  call(
    as,
    "POST",
    "/api/v1/planned-expenses",
    {
      description: "Condomínio",
      amountInCents: 65000,
      categoryId: moradia,
      dueOn: "2026-11-10",
      ...body,
    },
    opts,
  );
const patch = (as: ReturnType<typeof lucas>, id: string, body: Record<string, unknown>) =>
  call(as, "PATCH", `/api/v1/planned-expenses/${id}`, body);
const del = (as: ReturnType<typeof lucas>, id: string, version: number) =>
  call(as, "POST", `/api/v1/planned-expenses/${id}/delete`, { version });

describe("US-018 Cadastrar despesa prevista", () => {
  it("POST => 201, PREVISTO, version 1, valor, vencimento, autor = logado", async () => {
    const res = await create(lucas());
    expect(res.status).toBe(201);
    expect(res.body.plannedExpense).toMatchObject({
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-11-10",
      status: "PREVISTO",
      version: 1,
      isOverdue: false,
      isSharedExpense: true,
      paid: null,
      author: { id: mid("Lucas") },
      responsible: { id: mid("Lucas") },
      category: { name: "Moradia", archived: false },
    });
  });

  it("vencimento padrão = hoje; responsável em nome de outro: responsável Mariana, autor Lucas", async () => {
    const res = await create(lucas(), { dueOn: undefined, responsibleMemberId: mid("Mariana") });
    expect(res.body.plannedExpense).toMatchObject({
      dueOn: "2026-10-28",
      responsible: { id: mid("Mariana") },
      author: { id: mid("Lucas") },
    });
  });

  it("dividir com a família desligado persiste", async () => {
    const res = await create(lucas(), { description: "Plano de saúde", isSharedExpense: false });
    expect(res.body.plannedExpense.isSharedExpense).toBe(false);
  });

  it("vencimento passado fica atrasado; vencer hoje não; virada de dia em SP", async () => {
    const late = await create(lucas(), { description: "Internet", dueOn: "2026-10-20" });
    expect(late.body.plannedExpense).toMatchObject({ status: "PREVISTO", isOverdue: true });
    const today = await create(lucas(), { description: "Hoje", dueOn: "2026-10-28" });
    expect(today.body.plannedExpense.isOverdue).toBe(false);
    setDevClockOverride("2026-10-29T02:30:00Z"); // ainda 28/10 em SP
    const list = await call(lucas(), "GET", "/api/v1/planned-expenses?period=2026-10");
    expect(
      list.body.items.find((i: { description: string }) => i.description === "Hoje").isOverdue,
    ).toBe(false);
  });

  it("campos obrigatórios e descrição curta => 400 e nada criado", async () => {
    const res = await call(lucas(), "POST", "/api/v1/planned-expenses", {});
    expect(res.status).toBe(400);
    expect((await create(lucas(), { description: "A" })).body.error.message).toBe(
      "A descrição deve ter no mínimo 2 caracteres",
    );
    expect(await db.plannedExpense.count()).toBe(0);
  });

  it("referências: categoria de receita/arquivada/de outra família e responsável de outra família => 422", async () => {
    const income = (
      await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Salário" } })
    ).id;
    expect((await create(lucas(), { categoryId: income })).status).toBe(422);
    const arch = await db.category.update({
      where: { id: moradia },
      data: { archivedAt: new Date() },
    });
    const r = await create(lucas(), { categoryId: arch.id });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("INVALID_REFERENCE");
    await db.category.update({ where: { id: moradia }, data: { archivedAt: null } });
    const other = await makeFamily({ uniqueEmails: true });
    const alienCat = (
      await db.category.findFirstOrThrow({ where: { familyId: other.family.id, name: "Moradia" } })
    ).id;
    expect((await create(lucas(), { categoryId: alienCat })).status).toBe(422);
    expect(
      (await create(lucas(), { responsibleMemberId: other.members[0]?.memberId })).status,
    ).toBe(422);
  });
});

describe("US-018 Previsão não mexe no saldo, extrato, totais nem acerto (regressão)", () => {
  it("criar, editar e excluir deixam tudo idêntico", async () => {
    await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 50000,
      occurredOn: "2026-10-10",
      author: "Mariana",
      payer: "Mariana",
    });
    const snapshot = async () => ({
      balances: [...(await accountBalances(db as never, fx.family.id)).entries()],
      list: (await call(lucas(), "GET", "/api/v1/transactions?period=2026-10")).body,
      november: (await call(lucas(), "GET", "/api/v1/transactions?period=2026-11")).body,
      settlement: (await call(lucas(), "GET", "/api/v1/settlement")).body,
      rows: await db.transaction.count(),
    });
    const before = await snapshot();
    const made = await create(lucas(), { dueOn: "2026-10-30" });
    expect(await snapshot()).toEqual(before);
    const id = made.body.plannedExpense.id;
    expect(
      (await patch(lucas(), id, { version: 1, amountInCents: 68000, dueOn: "2026-11-12" })).status,
    ).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect((await del(lucas(), id, 2)).status).toBe(200);
    expect(await snapshot()).toEqual(before);
  });
});

describe("US-018 Editar, excluir e conflito", () => {
  it("PATCH => 200, version 2, updatedBy; sem diferença => 200 sem mudar version", async () => {
    const id = (await create(lucas())).body.plannedExpense.id;
    const res = await patch(mariana(), id, {
      version: 1,
      amountInCents: 68000,
      dueOn: "2026-11-12",
    });
    expect(res.status).toBe(200);
    expect(res.body.plannedExpense).toMatchObject({
      amountInCents: 68000,
      dueOn: "2026-11-12",
      version: 2,
      updatedBy: { id: mid("Mariana") },
    });
    const same = await patch(mariana(), id, { version: 2, amountInCents: 68000 });
    expect(same.status).toBe(200);
    expect(same.body.plannedExpense.version).toBe(2);
    const note = await patch(mariana(), id, { version: 2, note: "Boleto no e-mail" });
    expect(note.body.plannedExpense).toMatchObject({ note: "Boleto no e-mail", version: 3 });
    const clear = await patch(mariana(), id, { version: 3, note: null });
    expect(clear.body.plannedExpense).toMatchObject({ note: null, version: 4 });
  });

  it("em PAGO: PATCH e delete => 422 PLANNED_PAID_LOCKED", async () => {
    const t = await makeTransaction(fx, {
      account: itau,
      category: "Moradia",
      amountInCents: 65000,
      occurredOn: "2026-10-28",
    });
    const paid = await makePlannedExpense(fx, {
      description: "Paga",
      amountInCents: 65000,
      dueOn: "2026-10-28",
      paidTransactionId: t.id,
    });
    const p = await patch(lucas(), paid.id, { version: 1, amountInCents: 1000 });
    expect(p.status).toBe(422);
    expect(p.body.error.code).toBe("PLANNED_PAID_LOCKED");
    expect(p.body.error.message).toBe(
      "Despesa prevista paga não pode ser alterada. Use Desfazer pagamento.",
    );
    expect((await del(lucas(), paid.id, 1)).body.error.code).toBe("PLANNED_PAID_LOCKED");
  });

  it("excluir: some das listas e GET => 404; versão antiga => 409", async () => {
    const id = (await create(lucas())).body.plannedExpense.id;
    expect((await del(lucas(), id, 5)).status).toBe(409);
    expect((await del(lucas(), id, 1)).body).toEqual({ deleted: true });
    expect((await call(lucas(), "GET", `/api/v1/planned-expenses/${id}`)).status).toBe(404);
    const list = await call(lucas(), "GET", "/api/v1/planned-expenses?period=2026-11");
    expect(list.body.items).toHaveLength(0);
    expect(await db.plannedExpense.count({ where: { id, deletedAt: { not: null } } })).toBe(1);
  });

  it("conflito: dois PATCH com a mesma version => 1x200 e 1x409; perdedor não grava; mensagem 'alterada por Mariana'", async () => {
    const id = (await create(lucas())).body.plannedExpense.id;
    const [a, b] = await Promise.all([
      patch(mariana(), id, { version: 1, amountInCents: 70000 }),
      patch(lucas(), id, { version: 1, amountInCents: 80000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id } });
    expect(row.version).toBe(2);
    expect([70000n, 80000n]).toContain(row.amountInCents);
    const id2 = (await create(lucas(), { description: "Escola" })).body.plannedExpense.id;
    await patch(mariana(), id2, { version: 1, amountInCents: 70000 });
    const res = await patch(lucas(), id2, { version: 1, amountInCents: 80000 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar.",
    );
  });
});

describe("US-018 Listas por mês e agregador", () => {
  it("GET /planned-expenses?period=2026-11 ordenado por vencimento, com total", async () => {
    await create(lucas(), { description: "Condomínio", amountInCents: 65000, dueOn: "2026-11-10" });
    await create(lucas(), { description: "Escola", amountInCents: 120000, dueOn: "2026-11-05" });
    await create(lucas(), { description: "Outubro", amountInCents: 1000, dueOn: "2026-10-30" });
    const res = await call(lucas(), "GET", "/api/v1/planned-expenses?period=2026-11");
    expect(res.body.items.map((i: { description: string }) => i.description)).toEqual([
      "Escola",
      "Condomínio",
    ]);
    expect(res.body.totals).toMatchObject({ plannedInCents: 185000, overdueCount: 0, count: 2 });
    expect(res.body.period).toMatchObject({
      key: "2026-11",
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect((await call(lucas(), "GET", "/api/v1/planned-expenses?period=2026-13")).status).toBe(
      400,
    );
  });

  it("Resumo (US-025): 'A pagar' do mês — só vencimentos de outubro, atrasada marcada, máx. 5 itens, overdue conta todas", async () => {
    await create(lucas(), { description: "Internet", amountInCents: 12000, dueOn: "2026-10-20" });
    await create(lucas(), { description: "Luz", amountInCents: 20000, dueOn: "2026-10-30" });
    await create(lucas(), { description: "Borda", amountInCents: 100, dueOn: "2026-11-04" });
    await create(lucas(), { description: "Condomínio", amountInCents: 65000, dueOn: "2026-11-10" });
    const home = await call(lucas(), "GET", "/api/v1/home");
    const toPay = home.body.monthSummary.toPay;
    expect(toPay.items.map((i: { title: string }) => i.title)).toEqual(["Internet", "Luz"]);
    expect(toPay).toMatchObject({
      totalCount: 2,
      totalInCents: 32000,
      plannedInCents: 32000,
      invoicesInCents: 0,
      overdueCount: 1,
      overdueInCents: 12000,
    });
    expect(toPay.items[0].isOverdue).toBe(true);
    for (let i = 0; i < 6; i++) {
      await create(lucas(), { description: `Atrasada ${i}`, dueOn: "2026-10-01" });
    }
    const many = (await call(lucas(), "GET", "/api/v1/home")).body.monthSummary.toPay;
    expect(many.items).toHaveLength(5);
    expect(many.totalCount).toBe(8);
    expect(many.overdueCount).toBe(7);
  });

  it("faturas fechadas aparecem em /payables; pagas e abertas ficam fora; atrasadas de meses anteriores só no período corrente", async () => {
    const card: CardFixture = await makeCard(fx, {
      name: "Nubank Mariana",
      closingDay: 25,
      dueDay: 5,
    });
    await makeCardPurchase(fx, { card, amountInCents: 40000, occurredOn: "2026-10-10" }); // out: fechada em 28/10, vence 05/11
    await makeCardPurchase(fx, { card, amountInCents: 5000, occurredOn: "2026-10-27" }); // nov: aberta
    const sep = await makeCardPurchase(fx, { card, amountInCents: 7000, occurredOn: "2026-09-10" });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: sep.invoiceId as string, cardId: card.id, ref: "2026-09" },
      account: itau,
      amountInCents: 7000,
      paidOn: "2026-10-01",
    });
    const nov = await call(lucas(), "GET", "/api/v1/payables?period=2026-11");
    expect(nov.body.items).toHaveLength(1);
    expect(nov.body.items[0]).toMatchObject({
      type: "INVOICE",
      title: "Fatura Nubank Mariana",
      dueOn: "2026-11-05",
      amountInCents: 40000,
      href: `/cartoes/${card.id}?ref=2026-10`,
    });
    // overdue em outubro: previsão de 01/10 aparece no período corrente (out) e não em dezembro
    await create(lucas(), { description: "Velha", dueOn: "2026-09-15" });
    const cur = await call(lucas(), "GET", "/api/v1/payables");
    expect(cur.body.period.key).toBe("2026-10");
    expect(cur.body.items.map((i: { title: string }) => i.title)).toContain("Velha");
    expect(cur.body.items[0].title).toBe("Velha");
    expect(cur.body.totals.overdueCount).toBeGreaterThanOrEqual(1);
    const dec = await call(lucas(), "GET", "/api/v1/payables?period=2026-12");
    expect(dec.body.items).toHaveLength(0);
  });
});

describe("US-018/US-025 Resumo: faturas na linha própria 'A pagar'", () => {
  it("fatura vence no mês do vencimento (fechada ou aberta); vencida conta como atrasada; só no corrente", async () => {
    const card = await makeCard(fx, { name: "Nubank Mariana", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(fx, { card, amountInCents: 40000, occurredOn: "2026-10-10" });
    // hoje 28/10: a fatura de out vence 05/11 => fora de outubro, dentro de novembro
    let home = await call(lucas(), "GET", "/api/v1/home");
    expect(home.body.monthSummary.toPay.items).toHaveLength(0);
    const nov = await call(lucas(), "GET", "/api/v1/month-summary?period=2026-11");
    expect(nov.body.toPay.invoicesInCents).toBe(40000);
    expect(nov.body.toPay.items[0]).toMatchObject({
      type: "INVOICE",
      title: "Fatura Nubank Mariana",
      dueOn: "2026-11-05",
      amountInCents: 40000,
      isOverdue: false,
    });
    // hoje 06/11: vencida => no mês corrente e atrasada
    setDevClockOverride("2026-11-06T15:00:00Z");
    home = await call(lucas(), "GET", "/api/v1/home");
    expect(home.body.monthSummary.toPay).toMatchObject({
      invoicesInCents: 40000,
      overdueCount: 1,
      overdueInCents: 40000,
    });
  });
});

describe("US-018 Permissões, isolamento e infra", () => {
  it("membro comum (MEMBER) cadastra, edita e exclui", async () => {
    expect(fx.byName.Lucas?.role).toBe("MEMBER");
    const res = await create(lucas());
    expect(res.status).toBe(201);
    expect(
      (await patch(lucas(), res.body.plannedExpense.id, { version: 1, description: "Cond." }))
        .status,
    ).toBe(200);
    expect((await del(lucas(), res.body.plannedExpense.id, 2)).status).toBe(200);
  });

  it("isolamento: GET/PATCH/delete de outra família => 404; listas não vazam", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    const p = await makePlannedExpense(fx, {
      description: "Aluguel",
      amountInCents: 100000,
      dueOn: "2026-10-30",
    });
    expect((await call(b, "GET", `/api/v1/planned-expenses/${p.id}`)).status).toBe(404);
    expect((await patch(b, p.id, { version: 1, description: "Zz" })).status).toBe(404);
    expect((await del(b, p.id, 1)).status).toBe(404);
    expect((await call(b, "GET", "/api/v1/planned-expenses")).body.items).toHaveLength(0);
    expect((await call(b, "GET", "/api/v1/payables")).body.items).toHaveLength(0);
    expect((await call(b, "GET", "/api/v1/home")).body.monthSummary.toPay.items).toHaveLength(0);
  });

  it("idempotência: Promise.all com a mesma chave => 1 previsão", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      create(lucas(), {}, { idempotencyKey: key }),
      create(lucas(), {}, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await db.plannedExpense.count()).toBe(1);
  });

  it(".strict(): status/paidTransactionId/familyId/authorMemberId => 400; banco: PAGO sem paidTransactionId viola o CHECK", async () => {
    for (const extra of [
      { status: "PAGO" },
      { paidTransactionId: randomUUID() },
      { familyId: fx.family.id },
      { authorMemberId: mid("Lucas") },
    ]) {
      expect((await create(lucas(), extra)).status).toBe(400);
    }
    await expect(
      db.plannedExpense.create({
        data: {
          familyId: fx.family.id,
          description: "X",
          amountInCents: 100n,
          dueOn: new Date("2026-11-01T00:00:00Z"),
          categoryId: moradia,
          responsibleMemberId: mid("Lucas"),
          authorMemberId: mid("Lucas"),
          status: "PAGO",
        },
      }),
    ).rejects.toThrow(/planned_status_paid_chk/);
  });

  it("atomicidade: falha injetada após o INSERT => nada persiste", async () => {
    vi.spyOn(idempotency, "saveIdempotentResponse").mockRejectedValueOnce(
      new Error("falha injetada"),
    );
    expect((await create(lucas())).status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.plannedExpense.count()).toBe(0);
  });
});
