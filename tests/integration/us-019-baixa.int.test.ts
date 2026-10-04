import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import * as previstasRepoModule from "@/modules/previstas/repo";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
} from "../support/factories";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z"; // hoje = 10/11/2026
let fx: FamilyFixture;
let itau: AccountFixture;
let planned: { id: string };
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

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
  planned = await makePlannedExpense(fx, {
    description: "Condomínio",
    amountInCents: 65000,
    dueOn: "2026-11-10",
    responsible: "Lucas",
    category: "Moradia",
  });
});

const pay = (
  as: ReturnType<typeof lucas>,
  id: string,
  body: Record<string, unknown> = {},
  opts = {},
) =>
  call(
    as,
    "POST",
    `/api/v1/planned-expenses/${id}/pay`,
    { version: 1, accountId: itau.id, ...body },
    opts,
  );
const undo = (as: ReturnType<typeof lucas>, id: string, version: number) =>
  call(as, "POST", `/api/v1/planned-expenses/${id}/undo-payment`, { version });
const getPlanned = async (id = planned.id) =>
  (await call(lucas(), "GET", `/api/v1/planned-expenses/${id}`)).body.plannedExpense;
const balance = async () => (await accountBalances(db as never, fx.family.id)).get(itau.id);

describe("US-019 Dar baixa", () => {
  it("201: saldo debitado, PAGO, uma despesa EXPENSE com os dados da previsão, revisão CREATE e autor = quem deu baixa", async () => {
    const res = await pay(mariana(), planned.id);
    expect(res.status).toBe(201);
    expect(res.body.account).toEqual({ id: itau.id, balanceInCents: 235000 });
    expect(await balance()).toBe(235000);
    expect(res.body.plannedExpense).toMatchObject({
      status: "PAGO",
      version: 2,
      amountInCents: 65000,
      paid: {
        amountInCents: 65000,
        differenceInCents: 0,
        paidOn: "2026-11-10",
        accountName: "Itaú Lucas",
      },
    });
    const txs = await db.transaction.findMany({ where: { kind: "EXPENSE" } });
    expect(txs).toHaveLength(1);
    const t = txs[0];
    expect(t).toMatchObject({
      accountId: itau.id,
      description: "Condomínio",
      isSharedExpense: true,
      authorMemberId: mid("Mariana"),
      payerMemberId: mid("Lucas"),
    });
    expect(t?.amountInCents).toBe(65000n);
    expect(t?.occurredOn.toISOString().slice(0, 10)).toBe("2026-11-10");
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: planned.id } });
    expect(row).toMatchObject({ status: "PAGO", paidTransactionId: t?.id });
    expect(res.body.transaction.plannedExpenseId).toBe(planned.id);
    const revs = await db.transactionRevision.findMany({ where: { transactionId: t?.id } });
    expect(revs.map((r) => r.action)).toEqual(["CREATE"]);
  });

  it("valor efetivo diferente: saldo 231750, diferença +3250 e o previsto permanece", async () => {
    const res = await pay(lucas(), planned.id, { amountInCents: 68250 });
    expect(res.body.account.balanceInCents).toBe(231750);
    expect(res.body.plannedExpense).toMatchObject({
      amountInCents: 65000,
      paid: { amountInCents: 68250, differenceInCents: 3250 },
    });
    const lower = await makePlannedExpense(fx, {
      description: "Água",
      amountInCents: 10000,
      dueOn: "2026-11-10",
    });
    const r2 = await pay(lucas(), lower.id, { amountInCents: 9000 });
    expect(r2.body.plannedExpense.paid.differenceInCents).toBe(-1000);
  });

  it("a baixa gera a despesa real: extrato (Moradia, Itaú, 10/11) e totais do mês", async () => {
    const before = await call(lucas(), "GET", "/api/v1/transactions?period=2026-11");
    await pay(lucas(), planned.id, { amountInCents: 68250 });
    const res = await call(lucas(), "GET", "/api/v1/transactions?period=2026-11");
    expect(res.body.totals.expenseInCents).toBe(before.body.totals.expenseInCents + 68250);
    expect(res.body.items[0]).toMatchObject({
      amountInCents: 68250,
      occurredOn: "2026-11-10",
      category: { name: "Moradia" },
      account: { name: "Itaú Lucas" },
      plannedExpenseId: planned.id,
    });
  });

  it("quem pagou: padrão = responsável; com Mariana => pagador Mariana e autor Lucas", async () => {
    const a = await pay(lucas(), planned.id);
    expect(a.body.transaction.payer.id).toBe(mid("Lucas"));
    expect(a.body.plannedExpense.paid.payer.id).toBe(mid("Lucas"));
    const other = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 1000,
      dueOn: "2026-11-10",
    });
    const b = await pay(lucas(), other.id, { payerMemberId: mid("Mariana") });
    expect(b.body.transaction).toMatchObject({
      payer: { id: mid("Mariana") },
      author: { id: mid("Lucas") },
    });
  });

  it("acerto: comum entra pelo valor efetivo e data do pagamento; pessoal fica fora", async () => {
    const personal = await makePlannedExpense(fx, {
      description: "Plano de saúde",
      amountInCents: 30000,
      dueOn: "2026-11-10",
      shared: false,
    });
    await pay(lucas(), planned.id, { amountInCents: 68250 });
    const s1 = await call(lucas(), "GET", "/api/v1/settlement?period=2026-11");
    expect(s1.body.totalSharedInCents).toBe(68250);
    const lucasRow = s1.body.members.find(
      (m: { member: { id: string } }) => m.member.id === mid("Lucas"),
    );
    expect(lucasRow.paidInCents).toBe(68250);
    await pay(lucas(), personal.id);
    const s2 = await call(lucas(), "GET", "/api/v1/settlement?period=2026-11");
    expect(s2.body).toEqual(s1.body);
  });

  it("a previsão do mês seguinte permanece intacta (linha inteira)", async () => {
    const dez = await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 65000,
      dueOn: "2026-12-10",
    });
    const before = await db.plannedExpense.findUniqueOrThrow({ where: { id: dez.id } });
    await pay(lucas(), planned.id);
    expect(await db.plannedExpense.findUniqueOrThrow({ where: { id: dez.id } })).toEqual(before);
  });
});

describe("US-019 Validações", () => {
  it("data futura => 422; retroativa => 201; valor 0 => 400; sem conta => 400; nada gravado nos erros", async () => {
    const future = await pay(lucas(), planned.id, { paidOn: "2026-11-11" });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    expect(future.body.error.message).toBe("A data do pagamento não pode ser futura");
    expect((await pay(lucas(), planned.id, { amountInCents: 0 })).status).toBe(400);
    const noAcc = await call(lucas(), "POST", `/api/v1/planned-expenses/${planned.id}/pay`, {
      version: 1,
    });
    expect(noAcc.status).toBe(400);
    expect(noAcc.body.error.message).toBe("Escolha a conta do pagamento");
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
    expect(await balance()).toBe(300000);
    // virada em SP: 2026-11-11T02:30Z ainda é 10/11
    setDevClockOverride("2026-11-11T02:30:00Z");
    expect((await pay(lucas(), planned.id, { paidOn: "2026-11-11" })).status).toBe(422);
    const retro = await pay(lucas(), planned.id, { paidOn: "2026-11-08" });
    expect(retro.status).toBe(201);
    expect(retro.body.transaction.occurredOn).toBe("2026-11-08");
  });

  it("conta ficará negativa: 201 e saldo -55000", async () => {
    const poor = await makeAccount(fx, { name: "Pobre", openingBalanceInCents: 10000 });
    const res = await pay(lucas(), planned.id, { accountId: poor.id });
    expect(res.status).toBe(201);
    expect(res.body.account.balanceInCents).toBe(-55000);
  });

  it("conta ou pagador de outra família => 422 INVALID_REFERENCE", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const alienAcc = await makeAccount(other, { name: "Alheia", openingBalanceInCents: 1000 });
    const a = await pay(lucas(), planned.id, { accountId: alienAcc.id });
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe("INVALID_REFERENCE");
    const b = await pay(lucas(), planned.id, { payerMemberId: other.members[0]?.memberId });
    expect(b.status).toBe(422);
  });

  it("categoria arquivada depois do cadastro: a baixa ainda funciona", async () => {
    await db.category.updateMany({
      where: { familyId: fx.family.id, name: "Moradia" },
      data: { archivedAt: new Date() },
    });
    const res = await pay(lucas(), planned.id);
    expect(res.status).toBe(201);
    expect(res.body.transaction.category.archived).toBe(true);
  });
});

describe("US-019 Baixa única, idempotência e conflito", () => {
  it("segunda baixa com a versão atual de uma PAGO => 409 PLANNED_ALREADY_PAID; saldo debitado 1x", async () => {
    await pay(lucas(), planned.id);
    const again = await pay(lucas(), planned.id, { version: 2 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("PLANNED_ALREADY_PAID");
    expect(again.body.error.message).toBe("Esta despesa prevista já foi paga");
    expect(await balance()).toBe(235000);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
  });

  it("mesma chave em Promise.all => 1 despesa e Idempotent-Replay; chaves diferentes e mesma version => 1x201 e 1x409 VERSION_CONFLICT", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      pay(lucas(), planned.id, {}, { idempotencyKey: key }),
      pay(lucas(), planned.id, {}, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a, b].some((r) => r.headers.get("Idempotent-Replay") === "true")).toBe(true);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
    expect(await balance()).toBe(235000);

    const p2 = await makePlannedExpense(fx, {
      description: "Luz",
      amountInCents: 1000,
      dueOn: "2026-11-10",
    });
    const [c, d] = await Promise.all([pay(lucas(), p2.id), pay(mariana(), p2.id)]);
    expect([c.status, d.status].sort()).toEqual([201, 409]);
    const loser = c.status === 409 ? c : d;
    expect(loser.body.error.code).toBe("VERSION_CONFLICT");
    expect(await db.transaction.count({ where: { description: "Luz" } })).toBe(1);
  });

  it("conflito: Mariana baixa, Lucas com versão antiga => 'alterada por Mariana'; só um débito", async () => {
    expect((await pay(mariana(), planned.id)).status).toBe(201);
    const res = await pay(lucas(), planned.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
    expect(res.body.error.message).toBe(
      "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar.",
    );
    expect(await balance()).toBe(235000);
  });

  it("isolamento: pay/undo de outra família => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await pay(b, planned.id)).status).toBe(404);
    expect((await undo(b, planned.id, 1)).status).toBe(404);
  });
});

describe("US-019 Desfazer e vínculos com o extrato", () => {
  it("desfazer: saldo volta, PREVISTO inalterada, transação UNDONE com revisão UNDO; some de extrato/totais/acerto; repetir => 409; nova baixa => 201", async () => {
    await pay(lucas(), planned.id, { amountInCents: 68250 });
    const res = await undo(lucas(), planned.id, 2);
    expect(res.status).toBe(200);
    expect(res.body.plannedExpense).toMatchObject({
      status: "PREVISTO",
      amountInCents: 65000,
      paid: null,
      version: 3,
    });
    expect(await balance()).toBe(300000);
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: planned.id } });
    expect(row.paidTransactionId).toBeNull();
    const t = await db.transaction.findFirstOrThrow({ where: { kind: "EXPENSE" } });
    expect(t).toMatchObject({ deletionReason: "UNDONE" });
    expect(t.deletedAt).not.toBeNull();
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: t.id },
      orderBy: { revision: "asc" },
    });
    expect(revs.map((r) => r.action)).toEqual(["CREATE", "UNDO"]);
    const list = await call(lucas(), "GET", "/api/v1/transactions?period=2026-11");
    expect(list.body.items).toHaveLength(0);
    expect(list.body.totals.expenseInCents).toBe(0);
    expect(
      (await call(lucas(), "GET", "/api/v1/settlement?period=2026-11")).body.totalSharedInCents,
    ).toBe(0);
    const again = await undo(lucas(), planned.id, 3);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("PLANNED_NOT_PAID");
    const repay = await pay(lucas(), planned.id, { version: 3 });
    expect(repay.status).toBe(201);
    expect(await balance()).toBe(235000);
  });

  it("versão velha ao desfazer => 409 VERSION_CONFLICT", async () => {
    await pay(lucas(), planned.id);
    const res = await undo(lucas(), planned.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("despesa gerada: delete/restore pelo extrato => 422 LINKED_TO_PLANNED com a mensagem exata", async () => {
    const res = await pay(lucas(), planned.id);
    const id = res.body.transaction.id;
    const del = await call(lucas(), "POST", `/api/v1/transactions/${id}/delete`, { version: 1 });
    expect(del.status).toBe(422);
    expect(del.body.error.code).toBe("LINKED_TO_PLANNED");
    expect(del.body.error.message).toBe(
      "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.",
    );
    const restore = await call(lucas(), "POST", `/api/v1/transactions/${id}/restore`, {
      version: 1,
    });
    expect(restore.body.error.code).toBe("LINKED_TO_PLANNED");
    const detail = await call(lucas(), "GET", `/api/v1/transactions/${id}`);
    expect(detail.body.transaction.plannedExpenseId).toBe(planned.id);
  });

  it("corrigir o valor da despesa gerada atualiza a previsão (previsto x pago)", async () => {
    const res = await pay(lucas(), planned.id, { amountInCents: 68250 });
    const edit = await call(lucas(), "PATCH", `/api/v1/transactions/${res.body.transaction.id}`, {
      version: 1,
      amountInCents: 68000,
    });
    expect(edit.status).toBe(200);
    const p = await getPlanned();
    expect(p.paid).toMatchObject({ amountInCents: 68000, differenceInCents: 3000 });
    expect(p.amountInCents).toBe(65000);
  });
});

describe("US-019 Atomicidade", () => {
  it("falha no UPDATE da previsão => a despesa não persiste e o saldo é o original", async () => {
    const real = previstasRepoModule.previstasRepo;
    vi.spyOn(previstasRepoModule, "previstasRepo").mockImplementation((tx, familyId) => ({
      ...real(tx, familyId),
      markPaid: (() => {
        throw new Error("falha injetada");
      }) as never,
    }));
    const res = await pay(lucas(), planned.id);
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
    expect(await balance()).toBe(300000);
    expect((await getPlanned()).status).toBe("PREVISTO");
  });

  it("falha na gravação da revisão => nada persiste", async () => {
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    expect((await pay(lucas(), planned.id)).status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
    expect((await getPlanned()).status).toBe("PREVISTO");
  });

  it("falha ao desfazer (revisão UNDO) => o pagamento continua", async () => {
    await pay(lucas(), planned.id);
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    expect((await undo(lucas(), planned.id, 2)).status).toBe(500);
    vi.restoreAllMocks();
    expect((await getPlanned()).status).toBe("PAGO");
    expect(await balance()).toBe(235000);
  });
});
