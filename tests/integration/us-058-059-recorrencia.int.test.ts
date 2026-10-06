import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import { setDevClockOverride } from "@/lib/clock";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

// SDD-019 §3.7: G (geração), E (edição), F (encerrar), B (baixa), C (conta de pagamento).
const db = testDb();
const NOW = "2026-10-06T15:00:00Z"; // outubro/2026
let fx: FamilyFixture;
let corrente: AccountFixture;
let moradia: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(NOW);
  fx = await makeFamily();
  corrente = await makeAccount(fx, {
    name: "Corrente",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
  moradia = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Moradia" } })
  ).id;
});

const ctxOf = (): RequestContext =>
  ({
    familyId: fx.family.id,
    memberId: mid("Mariana"),
    role: "ADMIN",
    clock: { now: () => new Date(NOW) },
  }) as unknown as RequestContext;

const createSeries = (body: Record<string, unknown> = {}) =>
  call(mariana(), "POST", "/api/v1/recurring-expenses", {
    description: "Internet",
    amountInCents: 12000,
    categoryId: moradia,
    paymentAccountId: corrente.id,
    dayOfMonth: 10,
    startMonth: "2026-10",
    end: { kind: "NONE" },
    ...body,
  });
const patchSeries = (id: string, body: Record<string, unknown>) =>
  call(mariana(), "PATCH", `/api/v1/recurring-expenses/${id}`, body);
const occurrences = (seriesId: string, withDeleted = false) =>
  db.plannedExpense.findMany({
    where: { seriesId, ...(withDeleted ? {} : { deletedAt: null }) },
    orderBy: { occurrenceMonth: "asc" },
  });
const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);
const pay = (id: string, version = 1) =>
  call(mariana(), "POST", `/api/v1/planned-expenses/${id}/pay`, {
    version,
    accountId: corrente.id,
  });

describe("US-058 geração (G)", () => {
  it("G1: criar sem fim gera 12 linhas com vencimento no dia 10", async () => {
    const res = await createSeries();
    expect(res.status).toBe(201);
    expect(res.body.generatedCount).toBe(12);
    const rows = await occurrences(res.body.series.id);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => iso(r.dueOn)?.endsWith("-10"))).toBe(true);
    expect(iso(rows[0]?.dueOn)).toBe("2026-10-10");
    expect(iso(rows[11]?.dueOn)).toBe("2027-09-10");
    expect(rows[0]?.paymentAccountId).toBe(corrente.id);
  });

  it("por 6 meses gera 6 e dia 31 cai no último dia (fev=28, abr=30)", async () => {
    const six = await createSeries({ description: "Seguro", end: { kind: "COUNT", months: 6 } });
    expect(await occurrences(six.body.series.id)).toHaveLength(6);
    const c = await createSeries({ description: "Condomínio", dayOfMonth: 31 });
    const due = (await occurrences(c.body.series.id)).map((r) => iso(r.dueOn));
    expect(due).toContain("2027-02-28");
    expect(due).toContain("2027-04-30");
    expect(c.body.series.dayOfMonth).toBe(31);
  });

  it("G2/G3: reexecutar no mesmo mês não duplica; avançar 1 mês cria só 1", async () => {
    const { id } = (await createSeries()).body.series;
    await ensureRecurrenceHorizonStandalone(ctxOf(), db as never);
    await call(mariana(), "GET", "/api/v1/planned-expenses");
    expect(await occurrences(id)).toHaveLength(12);
    setDevClockOverride("2026-11-06T15:00:00Z");
    expect((await call(mariana(), "GET", "/api/v1/payables")).status).toBe(200);
    expect(await occurrences(id)).toHaveLength(13);
  });

  it("G4: duas transações paralelas não duplicam nem falham", async () => {
    const { id } = (await createSeries()).body.series;
    setDevClockOverride("2026-11-06T15:00:00Z");
    const ctx = { ...ctxOf(), clock: { now: () => new Date("2026-11-06T15:00:00Z") } };
    await Promise.all([
      ensureRecurrenceHorizonStandalone(ctx, db as never),
      ensureRecurrenceHorizonStandalone(ctx, db as never),
      ensureRecurrenceHorizonStandalone(ctx, db as never),
    ]);
    expect(await occurrences(id, true)).toHaveLength(13);
  });

  it("G5: ocorrência excluída não volta", async () => {
    const { id } = (await createSeries()).body.series;
    const [first] = await occurrences(id);
    const del = await call(mariana(), "POST", `/api/v1/planned-expenses/${first?.id}/delete`, {
      version: 1,
    });
    expect(del.status).toBe(200);
    setDevClockOverride("2026-11-06T15:00:00Z");
    await call(mariana(), "GET", "/api/v1/planned-expenses");
    const live = await occurrences(id);
    expect(live).toHaveLength(12); // 11 antigas + 1 nova; a excluída não foi recriada
    expect(live.map((r) => iso(r.occurrenceMonth))).not.toContain("2026-10-01");
  });

  it("G6: fuso — 31/10 23:30 em Brasília (já 01/11 em UTC) ainda é outubro", async () => {
    setDevClockOverride("2026-11-01T02:30:00Z");
    const { id } = (await createSeries()).body.series;
    const rows = await occurrences(id);
    expect(iso(rows[0]?.occurrenceMonth)).toBe("2026-10-01");
    expect(rows).toHaveLength(12);
  });

  it("validação: início fora da janela e sem conta => erro", async () => {
    expect((await createSeries({ startMonth: "2026-09" })).status).toBe(422);
    expect((await createSeries({ startMonth: "2027-10" })).status).toBe(422);
    expect((await createSeries({ paymentAccountId: undefined })).status).toBe(400);
  });
});

describe("US-058 edição (E)", () => {
  it("E1/E7: editar valor preserva a baixada; versão antiga => 409", async () => {
    const { id } = (await createSeries()).body.series;
    const [oct] = await occurrences(id);
    expect((await pay(oct?.id as string)).status).toBe(201);
    const res = await patchSeries(id, { version: 1, amountInCents: 13000 });
    expect(res.status).toBe(200);
    expect(res.body.affectedCount).toBe(11);
    const rows = await occurrences(id);
    expect(Number(rows[0]?.amountInCents)).toBe(12000);
    expect(rows[0]?.status).toBe("PAGO");
    expect(rows.slice(1).every((r) => Number(r.amountInCents) === 13000)).toBe(true);
    const tx = await db.transaction.findFirstOrThrow({
      where: { id: rows[0]?.paidTransactionId as string },
    });
    expect(Number(tx.amountInCents)).toBe(12000);
    expect((await patchSeries(id, { version: 1, amountInCents: 14000 })).status).toBe(409);
  });

  it("E2: exceção (dezembro 200,00) sobrevive à edição da série e vira 'alterada'", async () => {
    const { id } = (await createSeries()).body.series;
    const dec = (await occurrences(id)).find((r) => iso(r.occurrenceMonth) === "2026-12-01");
    const edit = await call(mariana(), "PATCH", `/api/v1/planned-expenses/${dec?.id}`, {
      version: 1,
      amountInCents: 20000,
    });
    expect(edit.body.plannedExpense).toMatchObject({
      isException: true,
      series: { id, dayOfMonth: 10 },
    });
    await patchSeries(id, { version: 1, amountInCents: 13000 });
    const rows = await occurrences(id);
    const dec2 = rows.find((r) => iso(r.occurrenceMonth) === "2026-12-01");
    expect(Number(dec2?.amountInCents)).toBe(20000);
    expect(Number(rows.find((r) => iso(r.occurrenceMonth) === "2026-11-01")?.amountInCents)).toBe(
      13000,
    );
    const series = await db.recurringExpense.findUniqueOrThrow({ where: { id } });
    expect(Number(series.amountInCents)).toBe(13000);
  });

  it("E3: mudar o dia 10 -> 31 recalcula os vencimentos", async () => {
    const { id } = (await createSeries()).body.series;
    await patchSeries(id, { version: 1, dayOfMonth: 31 });
    const due = (await occurrences(id)).map((r) => iso(r.dueOn));
    expect(due).toContain("2026-11-30");
    expect(due).toContain("2027-02-28");
    expect(due).toContain("2026-12-31");
  });

  it("E4: effectiveFrom futuro preserva os meses anteriores", async () => {
    const { id } = (await createSeries()).body.series;
    await patchSeries(id, { version: 1, amountInCents: 15000, effectiveFrom: "2027-01" });
    const rows = await occurrences(id);
    for (const r of rows) {
      const m = iso(r.occurrenceMonth) as string;
      expect(Number(r.amountInCents)).toBe(m >= "2027-01-01" ? 15000 : 12000);
    }
    expect((await patchSeries(id, { version: 2, effectiveFrom: "2026-09" })).status).toBe(422);
  });

  it("E5/E6: encurtar o fim exclui as além do novo fim e o impacto bate", async () => {
    const { id } = (await createSeries()).body.series;
    const impact = await call(
      mariana(),
      "GET",
      `/api/v1/recurring-expenses/${id}/impact?effectiveFrom=2026-10`,
    );
    expect(impact.body).toEqual({
      affectedCount: 12,
      keptPaidCount: 0,
      keptExceptionCount: 0,
      endCount: 12,
    });
    const res = await patchSeries(id, { version: 1, end: { kind: "COUNT", months: 3 } });
    expect(res.body.affectedCount).toBe(12); // 3 reescritas + 9 removidas
    expect(await occurrences(id)).toHaveLength(3);
    expect(res.body.series.endMonth).toBe("2026-12");
  });
});

describe("US-058 encerrar (F)", () => {
  it("F1/F2: remove futuras pendentes, mantém baixadas e atrasadas; 2x => 409 SERIES_ENDED", async () => {
    setDevClockOverride("2026-10-20T15:00:00Z");
    const { id } = (await createSeries()).body.series; // outubro (dia 10) já atrasada
    const rows = await occurrences(id);
    const nov = rows[1];
    expect((await pay(nov?.id as string)).status).toBe(201);
    const end = await call(mariana(), "POST", `/api/v1/recurring-expenses/${id}/end`, {
      version: 1,
    });
    expect(end.status).toBe(200);
    expect(end.body.removedCount).toBe(10);
    const left = await occurrences(id);
    expect(left.map((r) => iso(r.occurrenceMonth))).toEqual(["2026-10-01", "2026-11-01"]);
    expect(left[1]?.status).toBe("PAGO");
    setDevClockOverride("2027-03-06T15:00:00Z");
    await call(mariana(), "GET", "/api/v1/planned-expenses");
    expect(await occurrences(id, true)).toHaveLength(12);
    const again = await call(mariana(), "POST", `/api/v1/recurring-expenses/${id}/end`, {
      version: 2,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("SERIES_ENDED");
  });
});

describe("US-058 baixa (B)", () => {
  it("B1: baixa e desfazer mantêm o vínculo com a série e a conta sugerida", async () => {
    const { id } = (await createSeries({ isSharedExpense: false })).body.series;
    const [oct] = await occurrences(id);
    const paid = await pay(oct?.id as string);
    expect(paid.body.account.balanceInCents).toBe(488000);
    expect(paid.body.plannedExpense).toMatchObject({
      status: "PAGO",
      series: { id },
      paymentAccount: { id: corrente.id },
    });
    const undo = await call(mariana(), "POST", `/api/v1/planned-expenses/${oct?.id}/undo-payment`, {
      version: 2,
    });
    expect(undo.body.plannedExpense).toMatchObject({ status: "PREVISTO", series: { id } });
  });
});

describe("US-059 conta de pagamento (C)", () => {
  it("C1: conta arquivada na criação => 422; prevista avulsa aceita a conta", async () => {
    const archived = await makeAccount(fx, { name: "Antiga", owner: "Mariana" });
    await db.bankAccount.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const bad = await createSeries({ paymentAccountId: archived.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toBe("Escolha uma conta ativa");
    const ok = await call(mariana(), "POST", "/api/v1/planned-expenses", {
      description: "Condomínio",
      amountInCents: 65000,
      categoryId: moradia,
      dueOn: "2026-10-20",
      paymentAccountId: corrente.id,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.plannedExpense.paymentAccount).toEqual({
      id: corrente.id,
      name: "Corrente",
      archived: false,
    });
    const legacy = await call(mariana(), "POST", "/api/v1/planned-expenses", {
      description: "Antiga",
      amountInCents: 1000,
      categoryId: moradia,
      dueOn: "2026-10-20",
    });
    expect(legacy.body.plannedExpense.paymentAccount).toBeNull();
  });

  it("C2: geração com a conta arquivada depois copia null", async () => {
    const { id } = (await createSeries()).body.series;
    await db.bankAccount.update({ where: { id: corrente.id }, data: { archivedAt: new Date() } });
    setDevClockOverride("2026-11-06T15:00:00Z");
    await call(mariana(), "GET", "/api/v1/planned-expenses");
    const rows = await occurrences(id);
    expect(rows[0]?.paymentAccountId).toBe(corrente.id); // já existente
    expect(rows[12]?.paymentAccountId).toBeNull(); // nova
  });
});
