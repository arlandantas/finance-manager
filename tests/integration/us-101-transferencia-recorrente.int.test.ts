import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import { withClock } from "@/lib/clock";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

// US-101 (ADR-037 §5, spec 04b): série mensal de transferência prevista (servidor).
const db = testDb();
const NOW = "2026-12-03T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let poupanca: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);
const BASE = "/api/v1/recurring-transfers";
const makeOther = () =>
  makeFamily({ members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }] });
const ISO = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Lucas", openingBalanceInCents: 500000 });
  poupanca = await makeAccount(fx, {
    name: "Poupança",
    owner: "Mariana",
    type: "SAVINGS",
    openingBalanceInCents: 100000,
  });
});

const body = (over: Record<string, unknown> = {}) => ({
  fromAccountId: itau.id,
  toAccountId: poupanca.id,
  amountInCents: 100000,
  dayOfMonth: 5,
  startMonth: "2026-12",
  end: { kind: "NONE" },
  ...over,
});
const create = (over: Record<string, unknown> = {}, now = NOW, as = lucas(), key?: string) =>
  at(() => call(as, "POST", BASE, body(over), key ? { idempotencyKey: key } : {}), now);
const made = async (over: Record<string, unknown> = {}, now = NOW) => {
  const r = await create(over, now);
  expect(r.status).toBe(201);
  return r.body.series as { id: string; version: number };
};
const occ = (seriesId: string, withDeleted = false) =>
  db.plannedTransfer.findMany({
    where: { seriesId, ...(withDeleted ? {} : { deletedAt: null }) },
    orderBy: { occurrenceMonth: "asc" },
  });
const ensure = (now: string, familyId = fx.family.id, memberId = fx.byName.Lucas?.memberId) =>
  ensureRecurrenceHorizonStandalone(
    { familyId, memberId, role: "ADMIN", clock: { now: () => new Date(now) } } as RequestContext,
    db as never,
  );
const patch = (id: string, b: Record<string, unknown>, now = NOW, as = lucas()) =>
  at(() => call(as, "PATCH", `${BASE}/${id}`, b), now);
const end = (id: string, version: number, now = NOW, as = lucas()) =>
  at(() => call(as, "POST", `${BASE}/${id}/end`, { version }), now);
const snapshot = async () => ({
  balances: [...(await accountBalances(db as never, fx.family.id)).entries()].sort(),
  extrato: (await at(() => call(lucas(), "GET", "/api/v1/transactions"))).body,
  payables: (({ items, groups, totals, period }) => ({ items, groups, totals, period }))(
    (await at(() => call(lucas(), "GET", "/api/v1/payables"))).body,
  ),
  settlement: (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body,
  txCount: await db.transaction.count({ where: { familyId: fx.family.id } }),
});

describe("US-101 AC1: criar gera o horizonte sem efeito", () => {
  it("dia 5 a partir de dezembro: 12 PREVISTA (dez..nov), saldos, A pagar e acerto idênticos", async () => {
    const before = await snapshot();
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.body.generatedCount).toBe(12);
    const rows = await occ(r.body.series.id);
    expect(rows).toHaveLength(12);
    expect(ISO(rows[0]?.dueOn)).toBe("2026-12-05");
    expect(ISO(rows[11]?.dueOn)).toBe("2027-11-05");
    expect(rows.every((x) => x.status === "PREVISTA" && x.amountInCents === 100000n)).toBe(true);
    expect(rows.every((x) => x.fromAccountId === itau.id && x.toAccountId === poupanca.id)).toBe(
      true,
    );
    expect(await snapshot()).toEqual(before);
    expect(await db.transferGroup.count({ where: { familyId: fx.family.id } })).toBe(0);
  });

  it("por 6 meses gera 6; lista e GET devolvem a série", async () => {
    const s = await made({ end: { kind: "COUNT", months: 6 } });
    expect(await occ(s.id)).toHaveLength(6);
    const list = await at(() => call(mariana(), "GET", BASE));
    expect(list.body.items).toHaveLength(1);
    const one = await at(() => call(mariana(), "GET", `${BASE}/${s.id}`));
    expect(one.body.series).toMatchObject({ amountInCents: 100000, endMonth: "2027-05" });
    expect(one.body.impact).toBeUndefined();
  });
});

describe("US-101 AC2: validação", () => {
  it("sem origem ou destino => 400; contas iguais => 400; campo extra => 400", async () => {
    expect((await create({ fromAccountId: undefined })).status).toBe(400);
    expect((await create({ toAccountId: undefined })).status).toBe(400);
    expect((await create({ toAccountId: itau.id })).status).toBe(400);
    expect((await create({ extra: 1 })).status).toBe(400);
    expect((await create({ amountInCents: 0 })).status).toBe(400);
    expect((await create({ dayOfMonth: 32 })).status).toBe(400);
    expect(await db.recurringTransfer.count()).toBe(0);
  });

  it("início fora de [mês atual, +11] => 422; conta arquivada ou de outra família => 422", async () => {
    expect((await create({ startMonth: "2026-11" })).status).toBe(422);
    expect((await create({ startMonth: "2027-12" })).status).toBe(422);
    expect((await create({ startMonth: "2027-11" })).status).toBe(201);
    const other = await makeOther();
    const foreign = await makeAccount(other, { name: "X", openingBalanceInCents: 1 });
    expect((await create({ toAccountId: foreign.id })).status).toBe(422);
    await db.bankAccount.update({ where: { id: poupanca.id }, data: { archivedAt: new Date() } });
    expect((await create()).status).toBe(422);
  });

  it("CHECKs do banco: contas iguais, valor, dia, série sem mês, duplicata mesmo excluída", async () => {
    const s = await made();
    const base = { familyId: fx.family.id, authorMemberId: fx.byName.Lucas?.memberId as string };
    const ser = {
      ...base,
      fromAccountId: itau.id,
      toAccountId: poupanca.id,
      amountInCents: 1n,
      dayOfMonth: 1,
      startMonth: new Date("2026-12-01T00:00:00Z"),
    };
    await expect(
      db.recurringTransfer.create({ data: { ...ser, toAccountId: itau.id } }),
    ).rejects.toThrow();
    await expect(
      db.recurringTransfer.create({ data: { ...ser, amountInCents: 0n } }),
    ).rejects.toThrow();
    await expect(
      db.recurringTransfer.create({ data: { ...ser, dayOfMonth: 0 } }),
    ).rejects.toThrow();
    await expect(
      db.plannedTransfer.create({
        data: {
          ...base,
          fromAccountId: itau.id,
          toAccountId: poupanca.id,
          amountInCents: 1n,
          dueOn: new Date("2026-12-05T00:00:00Z"),
          seriesId: s.id,
        },
      }),
    ).rejects.toThrow();
    const [first] = await occ(s.id);
    await db.plannedTransfer.update({
      where: { id: first?.id },
      data: { deletedAt: new Date(), deletedByMemberId: base.authorMemberId },
    });
    await expect(
      db.plannedTransfer.create({
        data: {
          ...base,
          fromAccountId: itau.id,
          toAccountId: poupanca.id,
          amountInCents: 1n,
          dueOn: new Date("2026-12-05T00:00:00Z"),
          seriesId: s.id,
          occurrenceMonth: first?.occurrenceMonth,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("US-101 AC3: efetivar uma ocorrência", () => {
  it("efetivar dezembro cria só aquela transferência; as outras seguem PREVISTA", async () => {
    const s = await made();
    const [dez] = await occ(s.id);
    const r = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-transfers/${dez?.id}/realize`, { version: 1 }),
    );
    expect(r.status).toBe(201);
    expect(await db.transferGroup.count({ where: { familyId: fx.family.id } })).toBe(1);
    const rows = await occ(s.id);
    expect(rows.filter((x) => x.status === "EFETIVADA")).toHaveLength(1);
    expect(rows.filter((x) => x.status === "PREVISTA")).toHaveLength(11);
    expect(
      (await accountBalances(db as never, fx.family.id, [itau.id])).get(itau.id),
    ).toBeDefined();
  });
});

describe("US-101 AC4: editar e encerrar a série", () => {
  it("editar a partir de janeiro não toca dezembro, efetivada nem exceção; impact confere", async () => {
    const s = await made();
    const rows = await occ(s.id);
    const [dez, jan, fev, mar] = rows;
    await at(() =>
      call(lucas(), "POST", `/api/v1/planned-transfers/${jan?.id}/realize`, { version: 1 }),
    );
    const exc = await at(() =>
      call(lucas(), "PATCH", `/api/v1/planned-transfers/${fev?.id}`, {
        version: 1,
        amountInCents: 5,
      }),
    );
    expect(exc.body.plannedTransfer.isException).toBe(true);
    const descOnly = await at(() =>
      call(lucas(), "PATCH", `/api/v1/planned-transfers/${mar?.id}`, {
        version: 1,
        description: "Só nome",
      }),
    );
    expect(descOnly.body.plannedTransfer.isException).toBe(false);

    const imp = await at(() => call(lucas(), "GET", `${BASE}/${s.id}?impactFrom=2027-01`));
    expect(imp.body.impact).toEqual({
      affectedCount: 9,
      keptRealizedCount: 1,
      keptExceptionCount: 1,
      endCount: 10,
    });

    const res = await patch(s.id, {
      version: 1,
      effectiveFrom: "2027-01",
      amountInCents: 250000,
      dayOfMonth: 31,
      description: "Reserva",
    });
    expect(res.status).toBe(200);
    expect(res.body.affectedCount).toBe(9);
    const after = await occ(s.id);
    const by = (id?: string) => after.find((x) => x.id === id);
    expect(by(dez?.id)).toMatchObject({ amountInCents: 100000n, description: null });
    expect(ISO(by(dez?.id)?.dueOn)).toBe("2026-12-05");
    expect(by(jan?.id)).toMatchObject({ status: "EFETIVADA", amountInCents: 100000n });
    expect(by(fev?.id)).toMatchObject({ amountInCents: 5n, isException: true });
    expect(by(mar?.id)).toMatchObject({ amountInCents: 250000n, description: "Reserva" });
    expect(ISO(by(mar?.id)?.dueOn)).toBe("2027-03-31");
  });

  it("encurtar o fim exclui as ocorrências além do novo fim; estender completa o horizonte", async () => {
    const s = await made();
    const r = await patch(s.id, { version: 1, end: { kind: "COUNT", months: 4 } });
    expect(r.status).toBe(200);
    expect(await occ(s.id)).toHaveLength(4);
    const r2 = await patch(s.id, { version: 2, end: { kind: "NONE" } });
    expect(r2.status).toBe(200);
    expect(await occ(s.id, true)).toHaveLength(12); // as 8 excluídas não voltam; unique sem filtro
    expect(await occ(s.id)).toHaveLength(4);
  });

  it("editar: versão antiga 409, contas iguais 422, conta arquivada 422, sem campo extra", async () => {
    const s = await made();
    expect((await patch(s.id, { version: 9, amountInCents: 1 })).status).toBe(409);
    expect((await patch(s.id, { version: 1, toAccountId: itau.id })).status).toBe(422);
    expect((await patch(s.id, { version: 1, bogus: true })).status).toBe(400);
    expect((await patch(s.id, { version: 1, effectiveFrom: "2026-11" })).status).toBe(422);
    const novo = await makeAccount(fx, { name: "Nova", owner: "Lucas", openingBalanceInCents: 0 });
    await db.bankAccount.update({ where: { id: novo.id }, data: { archivedAt: new Date() } });
    expect((await patch(s.id, { version: 1, toAccountId: novo.id })).status).toBe(422);
    expect((await patch(s.id, { version: 1, description: null })).status).toBe(200);
  });

  it("encerrar remove futuras pendentes e mantém atrasadas e efetivadas; repetir 409; editar 409", async () => {
    const s = await made();
    const [dez] = await occ(s.id);
    await at(() =>
      call(lucas(), "POST", `/api/v1/planned-transfers/${dez?.id}/realize`, { version: 1 }),
    );
    const later = "2027-02-10T15:00:00Z"; // dez efetivada, jan e fev (05) atrasadas, de mar em diante futuras
    const r = await end(s.id, 1, later, mariana());
    expect(r.status).toBe(200);
    expect(r.body.removedCount).toBe(9);
    expect(r.body.series.endedAt).not.toBeNull();
    const live = await occ(s.id);
    expect(live.map((x) => ISO(x.dueOn))).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
    expect((await end(s.id, 2, later)).body.error.code).toBe("SERIES_ENDED");
    expect((await patch(s.id, { version: 2, amountInCents: 1 }, later)).status).toBe(409);
    await ensure("2027-06-10T15:00:00Z");
    expect(await occ(s.id, true)).toHaveLength(12); // encerrada não gera
    expect((await at(() => call(lucas(), "GET", BASE))).body.items).toHaveLength(0);
  });
});

describe("US-101 AC5: geração idempotente e concorrente", () => {
  it("5 ensure em paralelo não duplicam; ocorrência excluída não é recriada", async () => {
    const s = await made();
    const [dez] = await occ(s.id);
    await at(() =>
      call(lucas(), "POST", `/api/v1/planned-transfers/${dez?.id}/delete`, { version: 1 }),
    );
    const later = "2027-01-10T15:00:00Z";
    await Promise.all(Array.from({ length: 5 }, () => ensure(later)));
    await ensure(later);
    const all = await occ(s.id, true);
    expect(all).toHaveLength(13); // dez..dez/2027
    expect(new Set(all.map((x) => ISO(x.occurrenceMonth))).size).toBe(13);
    expect((await occ(s.id)).map((x) => x.id)).not.toContain(dez?.id);
    expect(
      (await db.recurringTransfer.findUniqueOrThrow({ where: { id: s.id } })).generatedThroughMonth,
    ).toEqual(new Date("2027-12-01T00:00:00Z"));
  });

  it("séries diferentes em paralelo (ensure x ensure) geram cada uma o seu horizonte", async () => {
    const a = await made();
    const b = await made({ dayOfMonth: 20, amountInCents: 7 });
    const later = "2027-02-10T15:00:00Z";
    await Promise.all([
      ...Array.from({ length: 3 }, () => ensure(later)),
      at(() => call(mariana(), "GET", "/api/v1/payables"), later),
    ]);
    expect(await occ(a.id, true)).toHaveLength(14);
    expect(await occ(b.id, true)).toHaveLength(14);
  });

  it("geração preguiçosa x edição x encerramento em paralelo: sem erro 500 e sem duplicata", async () => {
    const s = await made();
    const later = "2027-01-10T15:00:00Z";
    const results = await Promise.allSettled([
      ensure(later),
      patch(s.id, { version: 1, amountInCents: 9, effectiveFrom: "2027-01" }, later),
      end(s.id, 1, later),
      ensure(later),
    ]);
    for (const r of results) {
      expect(r.status).toBe("fulfilled");
      const v = (r as PromiseFulfilledResult<{ status?: number } | undefined>).value;
      if (v) expect([200, 409]).toContain(v.status);
    }
    const all = await occ(s.id, true);
    expect(new Set(all.map((x) => ISO(x.occurrenceMonth))).size).toBe(all.length);
    expect(all.length).toBeLessThanOrEqual(13);
  });

  it("POST com a mesma Idempotency-Key em paralelo cria uma única série", async () => {
    const key = randomUUID();
    const rs = await Promise.all(Array.from({ length: 3 }, () => create({}, NOW, lucas(), key)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(await db.recurringTransfer.count()).toBe(1);
    expect(await db.plannedTransfer.count()).toBe(12);
  });

  it("criar duas séries iguais com chaves diferentes em paralelo cria duas, sem colisão", async () => {
    await Promise.all([create(), create()]);
    expect(await db.recurringTransfer.count()).toBe(2);
    expect(await db.plannedTransfer.count()).toBe(24);
  });

  it("efetivar x editar a série em paralelo: a efetivada nunca é reescrita", async () => {
    const s = await made();
    const [dez, jan] = await occ(s.id);
    await Promise.all([
      at(() =>
        call(lucas(), "POST", `/api/v1/planned-transfers/${jan?.id}/realize`, { version: 1 }),
      ),
      patch(s.id, { version: 1, amountInCents: 321, effectiveFrom: "2026-12" }),
    ]);
    const after = await occ(s.id);
    const janAfter = after.find((x) => x.id === jan?.id);
    if (janAfter?.status === "EFETIVADA") expect(janAfter.amountInCents).toBe(100000n);
    expect(after.find((x) => x.id === dez?.id)?.amountInCents).toBe(321n);
    expect(await db.transferGroup.count({ where: { familyId: fx.family.id } })).toBe(1);
  });
});

describe("US-101 AC6: datas em meses curtos", () => {
  it("dia 31 cai no último dia (fev=28, abr=30, fev bissexto=29)", async () => {
    const s = await made({ dayOfMonth: 31 });
    const due = (await occ(s.id)).map((x) => ISO(x.dueOn));
    expect(due).toContain("2027-02-28");
    expect(due).toContain("2027-04-30");
    const leap = await made({ dayOfMonth: 30, startMonth: "2028-01" }, "2028-01-10T12:00:00Z");
    expect((await occ(leap.id)).map((x) => ISO(x.dueOn))).toContain("2028-02-29");
  });
});

describe("US-101: contas arquivadas, ex-membro, permissões e isolamento", () => {
  it("conta arquivada: a série não gera; ao reativar, completa; nada é gerado com a conta fora", async () => {
    const s = await made({ end: { kind: "NONE" } });
    await db.bankAccount.update({ where: { id: poupanca.id }, data: { archivedAt: new Date() } });
    await ensure("2027-03-10T15:00:00Z");
    expect(await occ(s.id, true)).toHaveLength(12);
    await db.bankAccount.update({ where: { id: poupanca.id }, data: { archivedAt: null } });
    await ensure("2027-03-10T15:00:00Z");
    expect(await occ(s.id, true)).toHaveLength(15);
  });

  it("ex-membro autor: a série continua gerando e outro membro edita e encerra", async () => {
    const s = await made();
    await db.member.update({
      where: { id: fx.byName.Lucas?.memberId },
      data: { removedAt: new Date(), removalKind: "LEFT" },
    });
    await ensure("2027-01-10T15:00:00Z", fx.family.id, fx.byName.Mariana?.memberId);
    expect(await occ(s.id, true)).toHaveLength(13);
    expect(
      (await patch(s.id, { version: 1, amountInCents: 3 }, "2027-01-10T15:00:00Z", mariana()))
        .status,
    ).toBe(200);
    expect((await end(s.id, 2, "2027-01-10T15:00:00Z", mariana())).status).toBe(200);
  });

  it("isolamento por família: outra família não lê, edita, encerra nem gera a série", async () => {
    const s = await made();
    const other = await makeOther();
    const as = other.members[0]?.as ?? null;
    expect((await at(() => call(as, "GET", `${BASE}/${s.id}`))).status).toBe(404);
    expect(
      (await at(() => call(as, "PATCH", `${BASE}/${s.id}`, { version: 1, amountInCents: 1 })))
        .status,
    ).toBe(404);
    expect((await end(s.id, 1, NOW, as)).status).toBe(404);
    expect((await at(() => call(as, "GET", BASE))).body.items).toHaveLength(0);
    await ensure("2027-02-10T15:00:00Z", other.family.id, other.members[0]?.memberId);
    expect(await occ(s.id, true)).toHaveLength(12);
    expect((await at(() => call(lucas(), "GET", `${BASE}/not-a-uuid`))).status).toBe(404);
    expect((await at(() => call(null, "GET", BASE))).status).toBe(401);
  });
});

describe("US-101: exportação LGPD", () => {
  it("exporta séries e a ligação das ocorrências; nada da outra família", async () => {
    const s = await made({ description: "Reserva" });
    const other = await makeOther();
    const a = await makeAccount(other, { name: "A", openingBalanceInCents: 1 });
    const b = await makeAccount(other, { name: "B", openingBalanceInCents: 1 });
    const foreign = await at(() =>
      call(
        other.members[0]?.as ?? null,
        "POST",
        BASE,
        body({ fromAccountId: a.id, toAccountId: b.id }),
      ),
    );
    expect(foreign.status).toBe(201);
    const ex = await at(() => call(mariana(), "GET", "/api/v1/me/export"));
    expect(ex.status).toBe(200);
    const series = ex.body.familiaAtual?.transferenciasRecorrentes;
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      id: s.id,
      contaOrigemId: itau.id,
      contaDestinoId: poupanca.id,
      valorEmCentavos: 100000,
      descricao: "Reserva",
      diaDoMes: 5,
      mesInicial: "2026-12-01",
      mesFinal: null,
      encerradaEm: null,
      autorId: fx.byName.Lucas?.memberId,
    });
    const planned = ex.body.familiaAtual?.transferenciasPrevistas;
    expect(planned).toHaveLength(12);
    expect(planned[0]).toMatchObject({
      recorrenciaId: s.id,
      mesOcorrencia: "2026-12-01",
      alterada: false,
    });
    expect(JSON.stringify(ex.body)).not.toContain(foreign.body.series.id);
  });
});
