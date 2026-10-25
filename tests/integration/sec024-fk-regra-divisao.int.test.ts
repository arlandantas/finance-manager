import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../support/db";
import { makeAccount, makeFamily, makeTransaction } from "../support/factories";

const db = testDb();
beforeEach(resetDb);

describe("SEC-024 FK composta transactions(familyId, splitRuleVersionId)", () => {
  it("o banco recusa lançamento apontando para regra de divisão de OUTRA família", async () => {
    const a = await makeFamily({ splitEngine: "LEGACY" });
    const acc = await makeAccount(a, {
      name: "Itaú",
      owner: "Mariana",
      openingBalanceInCents: 1000,
    });
    const tx = await makeTransaction(a, {
      account: acc,
      category: "Moradia",
      amountInCents: 100,
      occurredOn: "2026-10-10",
    });
    const b = await makeFamily({
      splitEngine: "LEGACY",
      members: [{ email: "outra@exemplo.com", name: "Outra", role: "ADMIN" }],
    });
    const foreign = await db.splitRuleVersion.create({
      data: {
        familyId: b.family.id,
        kind: "EQUAL",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const own = await db.splitRuleVersion.create({
      data: {
        familyId: a.family.id,
        kind: "EQUAL",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await expect(
      db.$executeRaw`UPDATE transactions SET "splitRuleVersionId" = ${foreign.id}::uuid WHERE id = ${tx.id}::uuid`,
    ).rejects.toThrow(/foreign key|violates|23503/i);
    // regra da própria família continua válida
    await db.$executeRaw`UPDATE transactions SET "splitRuleVersionId" = ${own.id}::uuid WHERE id = ${tx.id}::uuid`;
    const row = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(row.splitRuleVersionId).toBe(own.id);
  });
});
