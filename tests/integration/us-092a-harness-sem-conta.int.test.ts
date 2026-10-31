import { beforeAll, describe, expect, it } from "vitest";
import { diffSnapshots } from "@/modules/split/backfill";
import { contextOf, migrateFamily, snapshotPeriod } from "@/modules/split/migrate-family";
import { resetDb, testDb } from "../support/db";
import { buildUniverse, snapshotFamily } from "../support/split-universe";

/**
 * US-092a (SDD-033 §8.3): o harness do EN-002b com membros SEM CONTA (1 ou 2 por família, sementes fixas 1..240).
 * Propriedade: LEGACY ➜ migrateFamily ➜ STORED sem nenhuma diferença (gate de 1 centavo) em todos os períodos:
 * o motor trata o sem conta como qualquer membro. Também prova que `snapshotFamily` (base da 094b) é estável.
 */
const db = testDb();
const TODAY = "2026-12-15";
const SEEDS = Array.from({ length: Number(process.env.HARNESS_SEEDS ?? 240) }, (_, i) => i + 1);

beforeAll(async () => {
  await resetDb();
});

describe("US-092a: harness de famílias com membros sem conta", () => {
  it("snapshot LEGACY == snapshot STORED em todos os períodos, com 1 a 2 sem conta por família", async () => {
    let periods = 0;
    let withUnlinkedInShare = 0;
    for (const seed of SEEDS) {
      const u = await buildUniverse(seed, { unlinked: 1 + (seed % 2) });
      const familyId = u.fx.family.id;
      expect(await db.member.count({ where: { familyId, userId: null } }), `seed ${seed}`).toBe(
        1 + (seed % 2),
      );
      const ctx = contextOf(familyId, TODAY);
      const before = await db.$transaction(async (tx) => {
        const out = [];
        for (const key of u.months) out.push(await snapshotPeriod(tx, ctx, key, TODAY));
        return out;
      });
      const report = await db.$transaction((tx) => migrateFamily(tx, familyId, { today: TODAY }), {
        timeout: 120_000,
      });
      expect(report.status, `seed ${seed}`).toBe("DONE");
      const after = await db.$transaction(async (tx) => {
        const out = [];
        for (const key of u.months) out.push(await snapshotPeriod(tx, ctx, key, TODAY));
        return out;
      });
      for (const [i, b] of before.entries()) {
        expect(
          diffSnapshots(b, after[i] as (typeof after)[number]),
          `seed ${seed} período ${u.months[i]}`,
        ).toEqual([]);
        periods += 1;
      }
      const unlinkedSplits = await db.transactionSplit.count({
        where: { transaction: { familyId }, member: { userId: null } },
      });
      if (unlinkedSplits > 0) withUnlinkedInShare += 1;
    }
    expect(periods).toBeGreaterThan(SEEDS.length * 2);
    // o teste só vale se o sem conta realmente participou dos rateios em boa parte das famílias
    expect(withUnlinkedInShare).toBeGreaterThan(SEEDS.length / 4);
  }, 1_800_000);

  it("snapshotFamily é determinístico (base do antes/depois da 094b)", async () => {
    const u = await buildUniverse(4242, { unlinked: 2 });
    const a = await snapshotFamily(u, TODAY);
    const b = await snapshotFamily(u, TODAY);
    expect(b).toEqual(a);
    expect(a.members).toBe(u.memberCount);
    expect(a.periods).toHaveLength(u.months.length);
  });
});
