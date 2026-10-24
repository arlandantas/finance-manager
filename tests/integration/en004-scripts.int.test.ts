import { beforeEach, describe, expect, it } from "vitest";
import { run } from "../../scripts/ai-admin";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
const out: string[] = [];
const sh = (...a: string[]) => run(db, a, (l) => out.push(l), new Date("2028-11-10T12:00:00Z"));

beforeEach(async () => {
  await resetDb();
  out.length = 0;
  fx = await makeFamily();
});

describe("EN-004 scripts operacionais", () => {
  it("set-cap grava, limpa e valida", async () => {
    expect(await sh("set-cap", fx.family.id, "250")).toBe(0);
    expect((await db.family.findUnique({ where: { id: fx.family.id } }))?.aiMonthlyCapCents).toBe(
      250,
    );
    expect(await sh("set-cap", fx.family.id, "default")).toBe(0);
    expect(
      (await db.family.findUnique({ where: { id: fx.family.id } }))?.aiMonthlyCapCents,
    ).toBeNull();
    expect(await sh("set-cap", fx.family.id, "-1")).toBe(2);
    expect(await sh("set-cap", "00000000-0000-0000-0000-000000000000", "10")).toBe(1);
  });

  it("purge-usage apaga só eventos com mais de 24 meses", async () => {
    const mk = (createdAt: string, month: string) =>
      db.$executeRaw`INSERT INTO llm_usage_events (id, "familyId", month, purpose, "memberId", model, status, "reservedMicroBrl", "expiresAt", "createdAt", "settledAt")
        VALUES (gen_random_uuid(), ${fx.family.id}::uuid, ${month}, 'SPENDING_ANALYSIS', ${fx.byName.Mariana?.memberId}::uuid, 'm', 'SETTLED', 1, now(), ${new Date(createdAt)}, now())`;
    await mk("2026-10-01T00:00:00Z", "2026-10"); // 25 meses antes de 2028-11
    await mk("2027-01-01T00:00:00Z", "2027-01"); // 22 meses
    expect(await sh("purge-usage")).toBe(0);
    expect(await db.llmUsageEvent.count()).toBe(1);
  });
});
