import { beforeEach, describe, expect, it } from "vitest";
import { aiMonthKey } from "@/modules/ia/month";
import { effectiveCapCents, readUsage, reserveBudget, settleEvent } from "@/modules/ia/repo";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = new Date("2026-11-10T15:00:00Z");
const MONTH = aiMonthKey(NOW);
let fx: FamilyFixture;
let memberId: string;

const reserve = (estimateMicro: bigint, now = NOW, capCents = 1000) =>
  db.$transaction((tx) =>
    reserveBudget(tx, {
      familyId: fx.family.id,
      memberId,
      purpose: "SPENDING_ANALYSIS",
      model: "claude-haiku-5-5",
      estimateMicro,
      capCents,
      now,
    }),
  );
const month = async () => {
  const r = await db.$queryRaw<
    Array<{ s: bigint; r: bigint }>
  >`SELECT "spentMicroBrl" s, "reservedMicroBrl" r FROM llm_budget_months WHERE "familyId" = ${fx.family.id}::uuid AND month = ${MONTH}`;
  return r[0];
};
const settle = (eventId: string, costMicro: bigint, now = NOW, month = MONTH) =>
  db.$transaction((tx) =>
    settleEvent(tx, {
      eventId,
      familyId: fx.family.id,
      month,
      status: "SETTLED",
      outcome: "ok",
      costMicro,
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 12,
      attempts: 1,
      now,
    }),
  );

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  memberId = fx.byName.Mariana?.memberId as string;
});

describe("EN-004 orçamento: reserva e acerto atômicos", () => {
  it("reserva incrementa o reservado; acerto troca pela custo real", async () => {
    const r = await reserve(50_000n);
    expect(r.ok).toBe(true);
    expect(await month()).toEqual({ s: 0n, r: 50_000n });
    if (r.ok) await settle(r.eventId, 6_300n);
    expect(await month()).toEqual({ s: 6_300n, r: 0n });
    const u = await db.$queryRaw<Array<{ status: string; c: bigint }>>`
      SELECT status::text, "costMicroBrl" c FROM llm_usage_events`;
    expect(u).toEqual([{ status: "SETTLED", c: 6_300n }]);
  });

  it("gasto no teto ⇒ exceeded com resetsOn; estimativa acima do saldo ⇒ estimate_exceeds", async () => {
    await db.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl") VALUES (${fx.family.id}::uuid, ${MONTH}, 10000000)`;
    expect(await reserve(1n)).toEqual({ ok: false, reason: "exceeded", resetsOn: "2026-12-01" });
    await db.$executeRaw`UPDATE llm_budget_months SET "spentMicroBrl" = 9800000`;
    expect(await reserve(500_000n)).toMatchObject({ ok: false, reason: "estimate_exceeds" });
    expect(await db.llmUsageEvent.count()).toBe(0);
  });

  it("concorrência: 10 reservas com saldo para 3 ⇒ exatamente 3 passam e spent+reserved <= teto", async () => {
    await db.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl") VALUES (${fx.family.id}::uuid, ${MONTH}, 9100000)`;
    // teto 10,00 = 10_000_000; saldo 900_000; estimativa 300_000 ⇒ 3 cabem
    const rs = await Promise.all(Array.from({ length: 10 }, () => reserve(300_000n)));
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
    expect(rs.filter((r) => !r.ok && r.reason === "estimate_exceeds")).toHaveLength(7);
    const m = await month();
    expect((m?.s ?? 0n) + (m?.r ?? 0n)).toBeLessThanOrEqual(10_000_000n);
  });

  it("reserva órfã (+11 min) vira ABANDONED e conta como gasto; leitura também", async () => {
    const r = await reserve(400_000n);
    expect(r.ok).toBe(true);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    // leitura não escreve, mas já conta como gasta
    const snap = await db.$transaction((tx) => readUsage(tx, fx.family.id, 1000, later));
    expect(snap.spentMicro).toBe(400_000n);
    expect((await month())?.r).toBe(400_000n);
    // a próxima reserva converte
    expect((await reserve(1_000n, later)).ok).toBe(true);
    const m = await month();
    expect(m?.s).toBe(400_000n);
    expect(m?.r).toBe(1_000n);
    const ev = await db.llmUsageEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(ev.map((e) => e.status)).toEqual(["ABANDONED", "RESERVED"]);
    expect(ev[0]?.costMicroBrl).toBe(400_000n);
    // acerto tardio do evento abandonado só grava tokens (gasto já contado)
    if (r.ok) await settle(r.eventId, 6_300n, later);
    expect((await month())?.s).toBe(400_000n);
    expect(
      (await db.llmUsageEvent.findUnique({ where: { id: r.ok ? r.eventId : "" } }))?.inputTokens,
    ).toBe(10);
  });

  it("teto por família (aiMonthlyCapCents) sobrescreve o padrão", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: { aiMonthlyCapCents: 200 } });
    expect(await db.$transaction((tx) => effectiveCapCents(tx, fx.family.id, 500))).toBe(200);
    await db.family.update({ where: { id: fx.family.id }, data: { aiMonthlyCapCents: null } });
    expect(await db.$transaction((tx) => effectiveCapCents(tx, fx.family.id, 500))).toBe(500);
  });

  it("CHECKs do banco: contador negativo, RESERVED com settledAt e teto negativo", async () => {
    await expect(
      db.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl") VALUES (${fx.family.id}::uuid, '2026-11', -1)`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO llm_usage_events (id, "familyId", month, purpose, "memberId", model, status, "reservedMicroBrl", "expiresAt", "settledAt")
        VALUES (gen_random_uuid(), ${fx.family.id}::uuid, '2026-11', 'SPENDING_ANALYSIS', ${memberId}::uuid, 'm', 'RESERVED', 1, now(), now())`,
    ).rejects.toThrow();
    await expect(
      db.family.update({ where: { id: fx.family.id }, data: { aiMonthlyCapCents: -1 } }),
    ).rejects.toThrow();
  });

  it("esquema sem coluna de conteúdo: lista de colunas fixada", async () => {
    const cols = async (t: string) =>
      (
        await db.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name FROM information_schema.columns WHERE table_name = ${t} ORDER BY column_name`
      ).map((c) => c.column_name);
    expect(await cols("llm_usage_events")).toEqual(
      [
        "attempts",
        "costMicroBrl",
        "createdAt",
        "expiresAt",
        "familyId",
        "id",
        "inputTokens",
        "latencyMs",
        "memberId",
        "model",
        "month",
        "outcome",
        "outputTokens",
        "purpose",
        "reservedMicroBrl",
        "settledAt",
        "status",
      ].sort(),
    );
    expect(await cols("llm_budget_months")).toEqual(
      ["familyId", "month", "reservedMicroBrl", "spentMicroBrl", "updatedAt"].sort(),
    );
  });
});
