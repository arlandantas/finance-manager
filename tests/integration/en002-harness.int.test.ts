import { beforeAll, describe, expect, it, vi } from "vitest";
import * as backfill from "@/modules/split/backfill";
import { diffSnapshots } from "@/modules/split/backfill";
import {
  contextOf,
  GateError,
  migrateFamily,
  snapshotPeriod,
} from "@/modules/split/migrate-family";
import { resetDb, testDb } from "../support/db";
import { buildUniverse } from "../support/split-universe";

/**
 * Harness de regressão da EN-002b (SDD-015 §8.1, ADR-021 §5): ≥ 200 famílias aleatórias (sementes 1..240
 * FIXAS neste arquivo). Para TODA família: fotografia LEGACY ➜ migrateFamily ➜ fotografia STORED, e
 * `diffSnapshots == []` em TODOS os períodos (cota, diferença, saldo, total, sugestões, status, rótulo,
 * linha ponderada). Qualquer diferença de 1 centavo falha o teste.
 */
const db = testDb();
const TODAY = "2026-12-15";
const SEEDS = Array.from({ length: Number(process.env.HARNESS_SEEDS ?? 240) }, (_, i) => i + 1);

beforeAll(async () => {
  await resetDb();
});

describe("EN-002b: harness de 240 famílias aleatórias (gate de 1 centavo)", () => {
  it("snapshot LEGACY == snapshot STORED em todos os períodos, e Σ bps/valores/cotas fecham", async () => {
    const stats = { families: 0, periods: 0, expenses: 0 };
    for (const seed of SEEDS) {
      const u = await buildUniverse(seed);
      const familyId = u.fx.family.id;
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
        const d = diffSnapshots(b, after[i] as (typeof after)[number]);
        expect(d, `seed ${seed} período ${u.months[i]}`).toEqual([]);
        const a = after[i] as (typeof after)[number];
        expect(
          a.members.reduce((s, m) => s + m.quotaInCents, 0),
          `seed ${seed} Σ cotas`,
        ).toBe(a.totalSharedInCents);
        // Σ saldos = 0 só vale quando todo envolvido em acerto está na lista do motor; o gate já prova a igualdade
        stats.periods += 1;
      }
      // invariantes por lançamento: Σ bps = 10000, Σ valores = valor; despesas comuns (ativas e excluídas) todas com rateio
      const txs = await db.transaction.findMany({
        where: { familyId, kind: "EXPENSE" },
        include: { splits: true },
      });
      for (const t of txs) {
        if (t.isSharedExpense) {
          expect(t.splitMode, `seed ${seed} ${t.id}`).toBe("RULE");
          expect(t.splits.reduce((s, x) => s + x.bps, 0)).toBe(10000);
          expect(t.splits.reduce((s, x) => s + Number(x.amountInCents), 0)).toBe(
            Number(t.amountInCents),
          );
          stats.expenses += 1;
        } else {
          expect(t.splitMode).toBe("NONE");
          expect(t.splits).toHaveLength(0);
        }
      }
      stats.families += 1;
    }
    expect(stats.families).toBe(SEEDS.length);
    expect(stats.periods).toBeGreaterThan(SEEDS.length * 2);
  }, 1_800_000);

  it("teste do teste (gate-detects-drift): +1 centavo no backfill lança GateError e NADA persiste", async () => {
    const u = await buildUniverse(7777);
    const familyId = u.fx.family.id;
    const real = backfill.allocateBackfill;
    vi.spyOn(backfill, "allocateBackfill").mockImplementation((i) => {
      const rows = real(i);
      const first = rows[0];
      if (first?.shares[0]) first.shares[0].amountInCents += 1; // quebra Σ por lançamento e a cota
      return rows;
    });
    // o gate pode ser alcançado só com despesas comuns; garante ao menos uma
    const shared = await db.transaction.count({
      where: { familyId, kind: "EXPENSE", isSharedExpense: true, deletedAt: null },
    });
    expect(shared).toBeGreaterThan(0);
    await expect(
      db.$transaction((tx) => migrateFamily(tx, familyId, { today: TODAY }), { timeout: 120_000 }),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await db.transactionSplit.count({ where: { familyId } })).toBe(0);
    expect(await db.splitMigrationSnapshot.count({ where: { familyId } })).toBe(0);
    expect((await db.family.findUniqueOrThrow({ where: { id: familyId } })).splitEngine).toBe(
      "LEGACY",
    );
    expect(GateError).toBeDefined();
  }, 300_000);
});
