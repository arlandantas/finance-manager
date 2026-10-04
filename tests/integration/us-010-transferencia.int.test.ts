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
let itau: AccountFixture;
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

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
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 50000,
  });
});

const transfer = (as: ReturnType<typeof lucas>, body: Record<string, unknown>, opts = {}) =>
  at(() => call(as, "POST", "/api/v1/transfers", body, opts));
const body = (over: Record<string, unknown> = {}) => ({
  fromAccountId: itau.id,
  toAccountId: nubank.id,
  amountInCents: 100000,
  ...over,
});
const balance = async (id: string) =>
  (await accountBalances(db as never, fx.family.id, [id])).get(id);
const counts = async () => ({
  groups: await db.transferGroup.count(),
  legs: await db.transaction.count({ where: { kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }),
});

describe("US-010 Transferência entre contas", () => {
  it("Transferir com sucesso: saldos 200000 e 150000, Σ = 350000, balanceAfter corretos", async () => {
    const res = await transfer(lucas(), body());
    expect(res.status).toBe(201);
    expect(res.body.transfer).toMatchObject({
      kind: "TRANSFER",
      amountInCents: 100000,
      occurredOn: "2026-10-04",
      version: 1,
      undoneAt: null,
      settlement: null,
      from: { name: "Itaú Lucas", balanceAfterInCents: 200000 },
      to: { name: "Nubank Conjunta", balanceAfterInCents: 150000 },
      author: { name: "Lucas Silva" },
    });
    const list = await at(() => call(lucas(), "GET", "/api/v1/accounts"));
    expect(list.body.items.map((a: { balanceInCents: number }) => a.balanceInCents)).toEqual([
      200000, 150000,
    ]);
    expect(list.body.totalBalanceInCents).toBe(350000);
    const legs = await db.transaction.findMany({
      where: { transferGroupId: res.body.transfer.groupId },
    });
    expect(legs.map((l) => l.kind).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
    expect(
      legs.every((l) => l.amountInCents === 100000n && l.description === "Transferência"),
    ).toBe(true);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: { in: legs.map((l) => l.id) } },
    });
    expect(revs.map((r) => r.action)).toEqual(["CREATE", "CREATE"]);
  });

  it("Aparece vinculada no extrato: duas linhas com o mesmo transferGroupId e a conta da outra ponta", async () => {
    const res = await transfer(lucas(), body());
    const list = await at(() => call(lucas(), "GET", "/api/v1/transactions?type=TRANSFER"));
    expect(list.body.items).toHaveLength(2);
    const [a, b] = list.body.items;
    expect(a.transferGroupId).toBe(res.body.transfer.groupId);
    expect(b.transferGroupId).toBe(res.body.transfer.groupId);
    const out = list.body.items.find((i: { type: string }) => i.type === "TRANSFER_OUT");
    const inn = list.body.items.find((i: { type: string }) => i.type === "TRANSFER_IN");
    expect(out.account.name).toBe("Itaú Lucas");
    expect(out.counterpartAccount.name).toBe("Nubank Conjunta");
    expect(inn.account.name).toBe("Nubank Conjunta");
    expect(inn.counterpartAccount.name).toBe("Itaú Lucas");
  });

  it("Não é despesa nem receita: totais do extrato e painel de acerto não mudam", async () => {
    await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 10000,
      occurredOn: "2026-10-02",
    });
    const totalsBefore = (await at(() => call(lucas(), "GET", "/api/v1/transactions"))).body.totals;
    const settleBefore = await at(() => call(lucas(), "GET", "/api/v1/settlement"));
    await transfer(lucas(), body());
    const totalsAfter = (await at(() => call(lucas(), "GET", "/api/v1/transactions"))).body.totals;
    expect(totalsAfter).toMatchObject({
      incomeInCents: totalsBefore.incomeInCents,
      expenseInCents: totalsBefore.expenseInCents,
      balanceInCents: totalsBefore.balanceInCents,
    });
    expect((await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body).toEqual(
      settleBefore.body,
    );
  });

  it("Origem igual ao destino: 400 'Escolha contas diferentes' e nada criado", async () => {
    const res = await transfer(lucas(), body({ toAccountId: itau.id }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Escolha contas diferentes");
    expect(await counts()).toEqual({ groups: 0, legs: 0 });
  });

  it("Valor inválido: 0, -1, 1.5 e texto => 'Informe um valor maior que zero'", async () => {
    for (const amountInCents of [0, -1, 1.5, "NaN", undefined]) {
      const res = await transfer(lucas(), body({ amountInCents }));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe("Informe um valor maior que zero");
    }
    expect(await counts()).toEqual({ groups: 0, legs: 0 });
  });

  it("Origem sem saldo suficiente: 201 e saldo -30000 (sem bloqueio)", async () => {
    const poor = await makeAccount(fx, {
      name: "Carteira",
      owner: "Lucas",
      openingBalanceInCents: 20000,
    });
    const res = await transfer(lucas(), body({ fromAccountId: poor.id, amountInCents: 50000 }));
    expect(res.status).toBe(201);
    expect(res.body.transfer.from.balanceAfterInCents).toBe(-30000);
    expect(await balance(poor.id)).toBe(-30000);
  });

  it("Atomicidade: falha na revisão da perna de crédito => 0 linhas e saldos iguais", async () => {
    const real = ledger.recordRevision;
    let n = 0;
    vi.spyOn(ledger, "recordRevision").mockImplementation(async (...args) => {
      n += 1;
      if (n === 2) throw new Error("falha injetada na perna IN");
      return real(...args);
    });
    const res = await transfer(lucas(), body());
    expect(res.status).toBe(500);
    expect(await counts()).toEqual({ groups: 0, legs: 0 });
    expect(await balance(itau.id)).toBe(300000);
    expect(await balance(nubank.id)).toBe(50000);
    expect(await db.idempotencyRecord.count()).toBe(0);
  });

  it("Duplo clique não duplica: 2x simultâneas com a mesma chave => 1 grupo, 2 pernas", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      transfer(lucas(), body(), { idempotencyKey: key }),
      transfer(lucas(), body(), { idempotencyKey: key }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect([a, b].filter((r) => r.headers.get("Idempotent-Replay") === "true")).toHaveLength(1);
    expect(await counts()).toEqual({ groups: 1, legs: 2 });
    expect(await balance(itau.id)).toBe(200000);
  });

  it("Conta de outra família: 404 e nada criado", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const alien = await makeAccount(other, { name: "Alheia", openingBalanceInCents: 1000 });
    expect((await transfer(lucas(), body({ fromAccountId: alien.id }))).status).toBe(404);
    expect((await transfer(lucas(), body({ toAccountId: alien.id }))).status).toBe(404);
    expect(await counts()).toEqual({ groups: 0, legs: 0 });
  });

  it("Data futura => 422 e retroativa aceita; nota é guardada; campos desconhecidos => 400", async () => {
    expect((await transfer(lucas(), body({ occurredOn: "2026-10-05" }))).status).toBe(422);
    const ok = await transfer(lucas(), body({ occurredOn: "2026-10-01", note: " conta de luz " }));
    expect(ok.status).toBe(201);
    expect(ok.body.transfer).toMatchObject({ occurredOn: "2026-10-01", note: "conta de luz" });
    expect((await transfer(lucas(), body({ familyId: fx.family.id }))).status).toBe(400);
  });

  it("Invariante de pernas: 2ª perna OUT no mesmo grupo viola o índice único", async () => {
    const res = await transfer(lucas(), body());
    await expect(
      db.transaction.create({
        data: {
          familyId: fx.family.id,
          kind: "TRANSFER_OUT",
          direction: "DEBIT",
          accountId: itau.id,
          amountInCents: 1n,
          occurredOn: new Date("2026-10-04T00:00:00Z"),
          description: "x",
          authorMemberId: fx.byName.Lucas?.memberId as string,
          transferGroupId: res.body.transfer.groupId,
        },
      }),
    ).rejects.toThrow();
  });

  it("Desfazer: saldos revertidos, pernas UNDONE, revisões UNDO; repetir => ALREADY_UNDONE; versão velha => 409", async () => {
    const made = await transfer(lucas(), body());
    const id = made.body.transfer.groupId as string;
    const stale = await at(() =>
      call(mariana(), "POST", `/api/v1/transfers/${id}/undo`, { version: 7 }),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(await balance(itau.id)).toBe(200000);

    const res = await at(() =>
      call(mariana(), "POST", `/api/v1/transfers/${id}/undo`, { version: 1 }),
    );
    expect(res.status).toBe(200);
    expect(res.body.transfer.undoneAt).not.toBeNull();
    expect(res.body.transfer.version).toBe(2);
    expect(await balance(itau.id)).toBe(300000);
    expect(await balance(nubank.id)).toBe(50000);
    const legs = await db.transaction.findMany({ where: { transferGroupId: id } });
    expect(
      legs.every((l) => l.deletionReason === "UNDONE" && l.deletedAt !== null && l.version === 2),
    ).toBe(true);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: { in: legs.map((l) => l.id) }, action: "UNDO" },
    });
    expect(revs).toHaveLength(2);
    expect(
      revs.every((r) => r.actorMemberId === fx.byName.Mariana?.memberId && r.revision === 2),
    ).toBe(true);

    const again = await at(() =>
      call(mariana(), "POST", `/api/v1/transfers/${id}/undo`, { version: 2 }),
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_UNDONE");
    const detail = await at(() => call(lucas(), "GET", `/api/v1/transfers/${id}`));
    expect(detail.body.transfer.undoneAt).not.toBeNull();
  });

  it("Isolamento: GET e undo da transferência da Família A => 404 para a B", async () => {
    const made = await transfer(lucas(), body());
    const id = made.body.transfer.groupId as string;
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await at(() => call(b, "GET", `/api/v1/transfers/${id}`))).status).toBe(404);
    expect(
      (await at(() => call(b, "POST", `/api/v1/transfers/${id}/undo`, { version: 1 }))).status,
    ).toBe(404);
    expect((await at(() => call(b, "GET", "/api/v1/transfers/nao-e-uuid"))).status).toBe(404);
  });

  it("Sem sessão => 401", async () => {
    expect((await transfer(null, body())).status).toBe(401);
  });
});
