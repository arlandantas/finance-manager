import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

// US-100 (ADR-037, spec 04b): transferência prevista, cadastro e efetivação (servidor).
const db = testDb();
const NOW = "2026-12-03T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let poupanca: AccountFixture;
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);
const BASE = "/api/v1/planned-transfers";

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 500000,
  });
  poupanca = await makeAccount(fx, {
    name: "Poupança Mariana",
    owner: "Mariana",
    type: "SAVINGS",
    openingBalanceInCents: 100000,
  });
  nubank = await makeAccount(fx, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 20000,
  });
});

const create = async (over: Record<string, unknown> = {}, as = lucas()) =>
  at(() =>
    call(as, "POST", BASE, {
      fromAccountId: itau.id,
      toAccountId: poupanca.id,
      amountInCents: 100000,
      dueOn: "2026-12-05",
      ...over,
    }),
  );
const created = async (over: Record<string, unknown> = {}) => {
  const r = await create(over);
  expect(r.status).toBe(201);
  return r.body.plannedTransfer as { id: string; version: number };
};
const realize = (id: string, body: Record<string, unknown>, key?: string, as = lucas()) =>
  at(() => call(as, "POST", `${BASE}/${id}/realize`, body, key ? { idempotencyKey: key } : {}));
const balance = async (id: string) =>
  (await accountBalances(db as never, fx.family.id, [id])).get(id);
const groups = () => db.transferGroup.count({ where: { familyId: fx.family.id } });
const snapshot = async () => ({
  balances: [...(await accountBalances(db as never, fx.family.id)).entries()].sort(),
  extrato: (await at(() => call(lucas(), "GET", "/api/v1/transactions"))).body,
  payables: (await at(() => call(lucas(), "GET", "/api/v1/payables"))).body,
  settlement: (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body,
  txCount: await db.transaction.count({ where: { familyId: fx.family.id } }),
});

describe("US-100 AC1: prever não tem efeito", () => {
  it("R$ 1.000,00 de Itaú para Poupança em 05/12: saldos, extrato, A pagar e acerto idênticos", async () => {
    const before = await snapshot();
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.body.plannedTransfer).toMatchObject({
      from: { id: itau.id, name: "Itaú Lucas", archived: false },
      to: { id: poupanca.id, archived: false },
      amountInCents: 100000,
      dueOn: "2026-12-05",
      status: "PREVISTA",
      isOverdue: false,
      transferGroupId: null,
      version: 1,
    });
    expect(await snapshot()).toEqual(before);
    expect(await groups()).toBe(0);
  });
});

describe("US-100 AC2: recusas", () => {
  it("origem = destino (400), conta arquivada ou de outra família (422); nada gravado", async () => {
    expect((await create({ toAccountId: itau.id })).status).toBe(400);
    expect((await create({ amountInCents: 0 })).status).toBe(400);
    expect((await create({ amountInCents: 10_000_000_000 })).status).toBe(400);
    expect((await create({ extra: 1 })).status).toBe(400);
    expect((await create({ description: "a" })).status).toBe(400);
    await db.bankAccount.update({ where: { id: nubank.id }, data: { archivedAt: new Date() } });
    const arch = await create({ toAccountId: nubank.id });
    expect(arch.status).toBe(422);
    expect(arch.body.error.code).toBe("INVALID_REFERENCE");
    const other = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const foreign = await makeAccount(other, { name: "Alheia", openingBalanceInCents: 1 });
    const r = await create({ toAccountId: foreign.id });
    expect(r.status).toBe(422);
    expect(r.body.error.details?.[0]?.path ?? r.body.error.fields?.[0]?.path).toBe("toAccountId");
    expect(await db.plannedTransfer.count()).toBe(0);
  });
});

describe("US-100 AC3-4: efetivar e desfazer", () => {
  it("efetivar com 950,00 em 03/12 cria as duas pernas; desfazer devolve PREVISTA e reefetiva", async () => {
    const p = await created();
    const r = await realize(p.id, { version: 1, amountInCents: 95000, occurredOn: "2026-12-03" });
    expect(r.status).toBe(201);
    expect(r.body.plannedTransfer).toMatchObject({ status: "EFETIVADA", version: 2 });
    const groupId = r.body.transferGroupId as string;
    expect(r.body.plannedTransfer.transferGroupId).toBe(groupId);
    const legs = await db.transaction.findMany({ where: { transferGroupId: groupId } });
    expect(legs.map((l) => Number(l.amountInCents))).toEqual([95000, 95000]);
    expect(legs.map((l) => l.kind).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
    expect(await balance(itau.id)).toBe(500000 - 95000);
    expect(await balance(poupanca.id)).toBe(100000 + 95000);

    const undo = await at(() =>
      call(lucas(), "POST", `/api/v1/transfers/${groupId}/undo`, { version: 1 }),
    );
    expect(undo.status).toBe(200);
    const back = (await at(() => call(lucas(), "GET", `${BASE}/${p.id}`))).body.plannedTransfer;
    expect(back).toMatchObject({ status: "PREVISTA", transferGroupId: null, version: 3 });
    expect(await balance(itau.id)).toBe(500000);
    const again = await realize(p.id, { version: 3 });
    expect(again.status).toBe(201);
    expect(await balance(itau.id)).toBe(500000 - 100000);
  });

  it("padrão: valor previsto e data de hoje; descrição vira a da transferência", async () => {
    const p = await created({ description: "Reserva de dezembro" });
    const r = await realize(p.id, { version: 1 });
    expect(r.status).toBe(201);
    const leg = await db.transaction.findFirstOrThrow({
      where: { transferGroupId: r.body.transferGroupId, kind: "TRANSFER_OUT" },
    });
    expect(Number(leg.amountInCents)).toBe(100000);
    expect(leg.occurredOn.toISOString().slice(0, 10)).toBe("2026-12-03");
    expect(leg.description).toBe("Reserva de dezembro");
  });
});

describe("US-100 AC5: efetivada trava; concorrência", () => {
  it("efetivada não edita nem exclui (422)", async () => {
    const p = await created();
    await realize(p.id, { version: 1 });
    const patch = await at(() =>
      call(lucas(), "PATCH", `${BASE}/${p.id}`, { version: 2, amountInCents: 5 }),
    );
    expect(patch.status).toBe(422);
    expect(patch.body.error.code).toBe("PLANNED_TRANSFER_REALIZED_LOCKED");
    const del = await at(() => call(lucas(), "POST", `${BASE}/${p.id}/delete`, { version: 2 }));
    expect(del.status).toBe(422);
    expect(del.body.error.code).toBe("PLANNED_TRANSFER_REALIZED_LOCKED");
  });

  it("dois efetivar simultâneos (chaves diferentes): um 201, outro 409; uma transferência", async () => {
    const p = await created();
    const rs = await Promise.all([
      realize(p.id, { version: 1 }, randomUUID(), lucas()),
      realize(p.id, { version: 1 }, randomUUID(), mariana()),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)?.body.error.code).toBe(
      "PLANNED_TRANSFER_ALREADY_REALIZED",
    );
    expect(await groups()).toBe(1);
    expect(await balance(itau.id)).toBe(400000);
  });

  it("mesma chave de idempotência: no máximo uma transferência", async () => {
    const p = await created();
    const key = randomUUID();
    const rs = await Promise.all([
      realize(p.id, { version: 1 }, key),
      realize(p.id, { version: 1 }, key),
    ]);
    expect(rs.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(await groups()).toBe(1);
    expect(await balance(itau.id)).toBe(400000);
  });

  it("efetivar previstas diferentes nas mesmas contas, em sentidos opostos: sem deadlock", async () => {
    const a = await created();
    const b = await created({
      fromAccountId: poupanca.id,
      toAccountId: itau.id,
      amountInCents: 30000,
    });
    const rs = await Promise.all([
      realize(a.id, { version: 1 }, randomUUID(), lucas()),
      realize(b.id, { version: 1 }, randomUUID(), mariana()),
    ]);
    expect(rs.map((r) => r.status)).toEqual([201, 201]);
    expect(await groups()).toBe(2);
    expect(await balance(itau.id)).toBe(500000 - 100000 + 30000);
    expect(await balance(poupanca.id)).toBe(100000 + 100000 - 30000);
  });

  it("editar e excluir simultâneos com a mesma versão: um vence, o outro 409", async () => {
    const p = await created();
    const rs = await Promise.all([
      at(() => call(lucas(), "PATCH", `${BASE}/${p.id}`, { version: 1, amountInCents: 5000 })),
      at(() => call(mariana(), "POST", `${BASE}/${p.id}/delete`, { version: 1 })),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("US-100 AC6: tudo ou nada", () => {
  it("data futura recusa; sem grupo, sem pernas, prevista intacta", async () => {
    const p = await created();
    const r = await realize(p.id, { version: 1, occurredOn: "2026-12-04" });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    expect(await groups()).toBe(0);
    const row = await db.plannedTransfer.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "PREVISTA", transferGroupId: null, version: 1 });
    expect(await balance(itau.id)).toBe(500000);
  });

  it("conta arquivada impede efetivar (ACCOUNT_ARCHIVED_LOCKED)", async () => {
    const p = await created();
    await db.bankAccount.update({ where: { id: poupanca.id }, data: { archivedAt: new Date() } });
    const r = await realize(p.id, { version: 1 });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("ACCOUNT_ARCHIVED_LOCKED");
    expect(await groups()).toBe(0);
  });
});

describe("US-100 AC7: atrasada, lista, versão e exclusão", () => {
  it("isOverdue = PREVISTA e dueOn < hoje; lista com atrasadas primeiro", async () => {
    await created({ dueOn: "2026-12-10" });
    const late = await created({ dueOn: "2026-12-02" });
    await created({ dueOn: "2026-12-03" });
    const items = (await at(() => call(lucas(), "GET", BASE))).body.items;
    expect(items.map((i: { dueOn: string; isOverdue: boolean }) => [i.dueOn, i.isOverdue])).toEqual(
      [
        ["2026-12-02", true],
        ["2026-12-03", false],
        ["2026-12-10", false],
      ],
    );
    await realize(late.id, { version: 1 });
    const open = (await at(() => call(lucas(), "GET", `${BASE}?status=PREVISTA`))).body.items;
    expect(open).toHaveLength(2);
    const done = (await at(() => call(lucas(), "GET", `${BASE}?status=EFETIVADA`))).body.items;
    expect(done[0]).toMatchObject({ isOverdue: false, status: "EFETIVADA" });
    const dec = (await at(() => call(lucas(), "GET", `${BASE}?period=2026-12`))).body.items;
    expect(dec).toHaveLength(3);
    expect(
      (await at(() => call(lucas(), "GET", `${BASE}?period=2027-01`))).body.items,
    ).toHaveLength(0);
  });

  it("PATCH: sem diferença não sobe version; mudança sobe; versão velha 409 com nome", async () => {
    const p = await created();
    const same = await at(() =>
      call(lucas(), "PATCH", `${BASE}/${p.id}`, { version: 1, amountInCents: 100000 }),
    );
    expect(same.status).toBe(200);
    expect(same.body.plannedTransfer.version).toBe(1);
    const ch = await at(() =>
      call(lucas(), "PATCH", `${BASE}/${p.id}`, {
        version: 1,
        amountInCents: 7,
        description: "Extra",
      }),
    );
    expect(ch.body.plannedTransfer).toMatchObject({
      amountInCents: 7,
      description: "Extra",
      version: 2,
    });
    const old = await at(() =>
      call(mariana(), "PATCH", `${BASE}/${p.id}`, { version: 1, amountInCents: 9 }),
    );
    expect(old.status).toBe(409);
    expect(old.body.error.code).toBe("VERSION_CONFLICT");
    expect(old.body.error.message).toContain("alterada por Lucas");
    const eq = await at(() =>
      call(lucas(), "PATCH", `${BASE}/${p.id}`, { version: 2, toAccountId: itau.id }),
    );
    expect(eq.status).toBe(422);
  });

  it("excluir é lógico, some da lista e não efetiva", async () => {
    const p = await created();
    const del = await at(() => call(mariana(), "POST", `${BASE}/${p.id}/delete`, { version: 1 }));
    expect(del.status).toBe(200);
    expect((await at(() => call(lucas(), "GET", BASE))).body.items).toHaveLength(0);
    expect((await at(() => call(lucas(), "GET", `${BASE}/${p.id}`))).status).toBe(404);
    expect((await realize(p.id, { version: 1 })).status).toBe(404);
    expect(await db.plannedTransfer.count()).toBe(1);
  });
});

describe("US-100: isolamento e CHECKs", () => {
  it("outra família não lê, edita, exclui nem efetiva", async () => {
    const p = await created();
    const other = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const as = other.members[0]?.as ?? null;
    expect((await at(() => call(as, "GET", `${BASE}/${p.id}`))).status).toBe(404);
    expect((await at(() => call(as, "GET", BASE))).body.items).toHaveLength(0);
    expect(
      (await at(() => call(as, "PATCH", `${BASE}/${p.id}`, { version: 1, amountInCents: 1 })))
        .status,
    ).toBe(404);
    expect(
      (await at(() => call(as, "POST", `${BASE}/${p.id}/delete`, { version: 1 }))).status,
    ).toBe(404);
    expect((await realize(p.id, { version: 1 }, undefined, as)).status).toBe(404);
    expect((await at(() => call(null, "GET", BASE))).status).toBe(401);
    expect(await groups()).toBe(0);
  });

  it("CHECKs do banco: origem=destino, valor<=0, EFETIVADA sem grupo e exclusão de efetivada", async () => {
    const base = {
      familyId: fx.family.id,
      fromAccountId: itau.id,
      toAccountId: poupanca.id,
      amountInCents: 100n,
      dueOn: new Date("2026-12-05T00:00:00Z"),
      authorMemberId: fx.byName.Lucas?.memberId as string,
    };
    await expect(
      db.plannedTransfer.create({ data: { ...base, toAccountId: itau.id } }),
    ).rejects.toThrow();
    await expect(
      db.plannedTransfer.create({ data: { ...base, amountInCents: 0n } }),
    ).rejects.toThrow();
    await expect(
      db.plannedTransfer.create({ data: { ...base, status: "EFETIVADA" } }),
    ).rejects.toThrow();
    await expect(
      db.plannedTransfer.create({ data: { ...base, deletedAt: new Date() } }),
    ).rejects.toThrow();
  });
});

describe("US-100: exportação LGPD", () => {
  it("exporta as previstas da família (centavos, ids, situação) e nada de outra família", async () => {
    const p = await created({ description: "Reserva" });
    const done = await created({ amountInCents: 4321 });
    const r = await realize(done.id, { version: 1 });
    const other = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const a = await makeAccount(other, { name: "A", openingBalanceInCents: 1 });
    const b = await makeAccount(other, { name: "B", openingBalanceInCents: 1 });
    const foreign = await at(() =>
      call(other.members[0]?.as ?? null, "POST", BASE, {
        fromAccountId: a.id,
        toAccountId: b.id,
        amountInCents: 777,
        dueOn: "2026-12-05",
      }),
    );
    expect(foreign.status).toBe(201);
    const ex = await at(() => call(mariana(), "GET", "/api/v1/me/export"));
    expect(ex.status).toBe(200);
    const list = ex.body.familiaAtual?.transferenciasPrevistas;
    expect(list).toHaveLength(2);
    expect(list.find((x: { id: string }) => x.id === p.id)).toMatchObject({
      contaOrigemId: itau.id,
      contaDestinoId: poupanca.id,
      valorEmCentavos: 100000,
      vencimento: "2026-12-05",
      descricao: "Reserva",
      situacao: "PREVISTA",
      transferenciaId: null,
      autorId: fx.byName.Lucas?.memberId,
    });
    expect(list.find((x: { id: string }) => x.id === done.id)).toMatchObject({
      situacao: "EFETIVADA",
      valorEmCentavos: 4321,
      transferenciaId: r.body.transferGroupId,
    });
    expect(JSON.stringify(ex.body)).not.toContain(foreign.body.plannedTransfer.id);
  });
});
