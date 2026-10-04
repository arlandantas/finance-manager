import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../support/db";

const db = testDb();
beforeEach(resetDb);

const names = async (sql: string): Promise<string[]> =>
  (await db.$queryRawUnsafe<Array<{ n: string }>>(sql)).map((r) => r.n);

// SDD-006 §6: a migração aplicada traz os CHECKs, índices parciais e triggers do modelo (§4).
describe("EN-001/US-004 Migração íntegra (modelo-de-dados §4)", () => {
  it("CHECKs de família, transação e divisão", async () => {
    const checks = await names("SELECT conname AS n FROM pg_constraint WHERE contype = 'c'");
    for (const c of [
      "families_cut_day_chk",
      "split_bps_chk",
      "tx_amount_chk",
      "tx_kind_shape_chk",
      "tx_deleted_chk",
    ]) {
      expect(checks).toContain(c);
    }
  });

  it("índices únicos (nome de conta; perna de transferência)", async () => {
    const idx = await names("SELECT indexname AS n FROM pg_indexes WHERE schemaname = 'public'");
    expect(idx).toContain("bank_accounts_family_name_uq");
    expect(idx).toContain("tx_transfer_leg_uq");
  });

  it("triggers append-only", async () => {
    const triggers = await names("SELECT tgname AS n FROM pg_trigger WHERE NOT tgisinternal");
    expect(triggers).toContain("transaction_revisions_append_only");
    expect(triggers).toContain("transactions_no_delete");
  });

  it("os CHECKs barram dados inconsistentes", async () => {
    const family = await db.family.create({ data: { name: "F" } });
    await expect(
      db.$executeRawUnsafe(`UPDATE families SET "cutDay" = 29 WHERE id = '${family.id}'::uuid`),
    ).rejects.toThrow(/families_cut_day_chk/);
  });
});
