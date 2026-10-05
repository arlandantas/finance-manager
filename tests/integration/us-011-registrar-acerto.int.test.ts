import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
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
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture; // Lucas
let nubank: AccountFixture; // Mariana
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const id = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  nubank = await makeAccount(fx, {
    name: "Nubank Mariana",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
  // Contexto: "Lucas deve R$ 400,00 para Mariana" (S1)
  const exp = (payer: "Mariana" | "Lucas", amount: number, n: number) =>
    makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: amount,
      occurredOn: "2026-10-03",
      author: payer,
      payer,
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, n)),
    });
  await exp("Mariana", 200000, 1);
  await exp("Mariana", 40000, 2);
  await exp("Lucas", 120000, 3);
  await exp("Lucas", 40000, 4);
});

const body = (over: Record<string, unknown> = {}) => ({
  period: "2026-10",
  fromMemberId: id("Lucas"),
  toMemberId: id("Mariana"),
  amountInCents: 40000,
  fromAccountId: itau.id,
  toAccountId: nubank.id,
  ...over,
});
const settle = (as: ReturnType<typeof lucas>, b: Record<string, unknown>, opts = {}) =>
  at(() => call(as, "POST", "/api/v1/settlements", b, opts));
const panel = () => at(() => call(mariana(), "GET", "/api/v1/settlement"));
const bal = async (a: AccountFixture) =>
  (await accountBalances(db as never, fx.family.id, [a.id])).get(a.id);
const groups = () => db.transferGroup.count({ where: { kind: "SETTLEMENT" } });

describe("US-011 Registrar o acerto de contas", () => {
  it("Quitar integralmente: saldos ±40000, grupo SETTLEMENT, descrição das pernas, painel SETTLED", async () => {
    const res = await settle(lucas(), body());
    expect(res.status).toBe(201);
    expect(await bal(itau)).toBe(260000);
    expect(await bal(nubank)).toBe(100000 - 400000 + 40000);
    const g = await db.transferGroup.findFirstOrThrow({
      where: { kind: "SETTLEMENT" },
      include: { legs: true },
    });
    expect(g).toMatchObject({
      settlementPeriod: "2026-10",
      settlementFromMemberId: id("Lucas"),
      settlementToMemberId: id("Mariana"),
    });
    expect(g.legs.map((l) => l.description)).toEqual([
      "Acerto de contas - Outubro",
      "Acerto de contas - Outubro",
    ]);
    expect(res.body.transfer.kind).toBe("SETTLEMENT");
    expect(res.body.settlement.status).toBe("SETTLED");
    expect(res.body.settlement.suggestions).toEqual([]);
  });

  it("Acerto parcial: 15000 => 'Lucas deve 25000' (S9)", async () => {
    await settle(lucas(), body({ amountInCents: 15000 }));
    const p = await panel();
    expect(p.body.status).toBe("PENDING");
    expect(p.body.suggestions[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      amountInCents: 25000,
    });
  });

  it("Valor acima do devido: 422 com a mensagem exata e nada gravado", async () => {
    const res = await settle(lucas(), body({ amountInCents: 50000 }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SETTLEMENT_EXCEEDS_DUE");
    expect(res.body.error.message.replace(/ /g, " ")).toBe(
      "O valor não pode ser maior que o devido (R$ 400,00)",
    );
    expect(res.body.error.details).toEqual({ dueInCents: 40000 });
    expect(await groups()).toBe(0);
  });

  it("Acerto não distorce receitas e despesas: totais do extrato e saldo consolidado inalterados", async () => {
    const totals = () =>
      at(() => call(lucas(), "GET", "/api/v1/transactions")).then((r) => r.body.totals);
    const total = () =>
      at(() => call(lucas(), "GET", "/api/v1/accounts")).then((r) => r.body.totalBalanceInCents);
    const [t0, c0] = [await totals(), await total()];
    await settle(lucas(), body());
    expect(await totals()).toMatchObject({
      incomeInCents: t0.incomeInCents,
      expenseInCents: t0.expenseInCents,
    });
    expect(await total()).toBe(c0);
  });

  it("Histórico do acerto: settlements[0] com de/para, valor, data e contas", async () => {
    await settle(lucas(), body());
    const p = await panel();
    expect(p.body.settlements).toHaveLength(1);
    expect(p.body.settlements[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      to: { name: "Mariana Silva" },
      amountInCents: 40000,
      occurredOn: "2026-10-04",
      fromAccount: { name: "Itaú Lucas" },
      toAccount: { name: "Nubank Mariana" },
      label: "Acerto de contas - Outubro",
    });
  });

  it("Nova despesa comum após o acerto: S11 => 'Lucas deve 10000'", async () => {
    await settle(lucas(), body());
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 20000,
      occurredOn: "2026-10-04",
      author: "Mariana",
      payer: "Mariana",
    });
    expect((await panel()).body.suggestions[0].amountInCents).toBe(10000);
  });

  it("Duplo clique: mesma chave => 1 grupo e 2 pernas; chaves diferentes => o 2º falha (lock + recálculo)", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      settle(lucas(), body(), { idempotencyKey: key }),
      settle(lucas(), body(), { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await groups()).toBe(1);
    expect(
      await db.transaction.count({ where: { kind: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } } }),
    ).toBe(2);
    const [c, d] = await Promise.all([settle(lucas(), body()), settle(mariana(), body())]);
    expect([c.status, d.status].sort()).toEqual([422, 422]);
    expect(
      [c, d].every((r) =>
        ["SETTLEMENT_NOT_DUE", "SETTLEMENT_EXCEEDS_DUE"].includes(r.body.error.code),
      ),
    ).toBe(true);
    expect(await groups()).toBe(1);
  });

  it("Corrida com chaves diferentes e valor integral: exatamente um acerto vence", async () => {
    const [a, b] = await Promise.all([settle(lucas(), body()), settle(mariana(), body())]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    expect(await groups()).toBe(1);
  });

  it("Origem igual ao destino: 400 'Escolha contas diferentes'", async () => {
    const res = await settle(lucas(), body({ toAccountId: itau.id }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Escolha contas diferentes");
  });

  it("Permissão: não envolvido e não ADMIN => 403; envolvido => 201; ADMIN não envolvido => 201", async () => {
    const user = await db.user.create({ data: { email: "x@exemplo.com", name: "Xavier" } });
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.id,
        role: "MEMBER",
        joinedAt: new Date("2026-11-05T00:00:00Z"),
      },
    });
    const { asUser } = await import("../support/factories");
    const xavier = await asUser("x@exemplo.com");
    const denied = await settle(xavier, body());
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe(
      "Somente os envolvidos ou um Administrador podem registrar o acerto",
    );
    expect((await settle(lucas(), body({ amountInCents: 10000 }))).status).toBe(201);
    // Mariana é credora (envolvida) e ADMIN; o ADMIN não envolvido é coberto trocando o papel de Lucas
    await db.member.update({ where: { id: id("Lucas") }, data: { role: "MEMBER" } });
    await db.member.update({ where: { id: id("Mariana") }, data: { role: "MEMBER" } });
    await db.member.updateMany({ where: { userId: user.id }, data: { role: "ADMIN" } });
    expect((await settle(xavier, body({ amountInCents: 10000 }))).status).toBe(201);
  });

  it("Par não devido: credor -> devedor => 422 SETTLEMENT_NOT_DUE", async () => {
    const res = await settle(
      lucas(),
      body({
        fromMemberId: id("Mariana"),
        toMemberId: id("Lucas"),
        fromAccountId: nubank.id,
        toAccountId: itau.id,
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SETTLEMENT_NOT_DUE");
    expect(res.body.error.message).toBe("Não há valor a acertar entre estes membros");
  });

  it("Desfazer acerto: undo devolve o painel ao devido", async () => {
    const res = await settle(lucas(), body());
    const undo = await at(() =>
      call(lucas(), "POST", `/api/v1/transfers/${res.body.transfer.groupId}/undo`, { version: 1 }),
    );
    expect(undo.status).toBe(200);
    const p = await panel();
    expect(p.body.status).toBe("PENDING");
    expect(p.body.suggestions[0].amountInCents).toBe(40000);
    expect(p.body.settlements).toEqual([]);
  });

  it("Inversão de sentido (S12): excluir a despesa de 40000 da Mariana após quitar => Mariana deve 20000", async () => {
    await settle(lucas(), body());
    const del = await db.transaction.findFirstOrThrow({
      where: { amountInCents: 40000n, payerMemberId: id("Mariana"), kind: "EXPENSE" },
    });
    await db.transaction.update({
      where: { id: del.id },
      data: { deletedAt: new Date(), deletedByMemberId: id("Mariana"), deletionReason: "DELETED" },
    });
    const p = await panel();
    expect(p.body.suggestions[0]).toMatchObject({
      from: { name: "Mariana Silva" },
      to: { name: "Lucas Silva" },
      amountInCents: 20000,
    });
  });

  it("Atomicidade: falha na revisão da perna de crédito => nenhum acerto/perna; painel igual", async () => {
    const before = (await panel()).body;
    const real = ledger.recordRevision;
    let n = 0;
    vi.spyOn(ledger, "recordRevision").mockImplementation(async (...a) => {
      n += 1;
      if (n === 2) throw new Error("falha injetada");
      return real(...a);
    });
    expect((await settle(lucas(), body())).status).toBe(500);
    expect(await groups()).toBe(0);
    vi.restoreAllMocks();
    expect((await panel()).body).toEqual(before);
  });

  it("Referências e data: membro/conta de outra família, data futura, período inválido", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const alienAccount = await makeAccount(other, { name: "Alheia", openingBalanceInCents: 1 });
    expect((await settle(lucas(), body({ fromAccountId: alienAccount.id }))).status).toBe(404);
    expect(
      (await settle(lucas(), body({ toMemberId: other.members[0]?.memberId }))).body.error.code,
    ).toBe("INVALID_REFERENCE");
    expect((await settle(lucas(), body({ occurredOn: "2026-10-05" }))).status).toBe(422);
    expect((await settle(lucas(), body({ period: "2026-13" }))).status).toBe(400);
    expect((await settle(lucas(), body({ amountInCents: 0 }))).body.error.message).toBe(
      "Informe um valor maior que zero",
    );
    expect(await groups()).toBe(0);
  });
});
