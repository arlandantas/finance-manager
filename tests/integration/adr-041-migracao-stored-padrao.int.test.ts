import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATION_NAME } from "@/modules/split/migrate-family";
import { resetDb, testDb } from "../support/db";
import { makeAccount, makeFamily, makeTransaction } from "../support/factories";

const db = testDb();
const SQL = readFileSync(
  "prisma/migrations/20261108000200_split_engine_stored_padrao/migration.sql",
  "utf8",
);
const statements = SQL.split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);
const applyMigration = async () => {
  for (const s of statements) await db.$executeRawUnsafe(s);
};
const engineOf = async (id: string) =>
  (await db.family.findUniqueOrThrow({ where: { id } })).splitEngine;
const marks = (id: string) =>
  db.dataMigration.findMany({ where: { familyId: id, name: MIGRATION_NAME } });

beforeEach(resetDb);

describe("ADR-041: virada das famílias LEGACY sem rateio a preencher", () => {
  it("LEGACY vazia vira STORED com marca DONE; é idempotente", async () => {
    const fx = await makeFamily({ splitEngine: "LEGACY" });
    await applyMigration();
    await applyMigration();
    expect(await engineOf(fx.family.id)).toBe("STORED");
    const m = await marks(fx.family.id);
    expect(m).toHaveLength(1);
    expect(m[0]?.state).toBe("DONE");
  });

  it("LEGACY com despesa comum NÃO vira", async () => {
    const fx = await makeFamily({ splitEngine: "LEGACY" });
    const acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana" });
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 10_000,
      occurredOn: "2026-10-05",
      author: "Mariana",
      payer: "Mariana",
      shared: true,
    });
    await applyMigration();
    expect(await engineOf(fx.family.id)).toBe("LEGACY");
    expect(await marks(fx.family.id)).toHaveLength(0);
  });

  it("família já STORED fica intacta (sem marca nova)", async () => {
    const fx = await makeFamily({ splitEngine: "STORED" });
    await applyMigration();
    expect(await engineOf(fx.family.id)).toBe("STORED");
    expect(await marks(fx.family.id)).toHaveLength(0);
  });
});
