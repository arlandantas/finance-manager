import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../support/db";
import {
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeTransaction,
} from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
let card: CardFixture;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
});

const day = (d: Date) => d.toISOString().slice(0, 10);
const catId = async () =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } }))
    .id;

async function makePlan(total = 30000, count = 3) {
  return db.installmentPlan.create({
    data: {
      familyId: fx.family.id,
      cardId: card.id,
      totalInCents: BigInt(total),
      installmentCount: count,
      purchaseOn: new Date("2026-11-10T00:00:00Z"),
      description: "Notebook",
      categoryId: await catId(),
      payerMemberId: fx.members[0]?.memberId as string,
      authorMemberId: fx.members[0]?.memberId as string,
    },
  });
}

async function parcel(planId: string, no: number, ref: string, over: Record<string, unknown> = {}) {
  const inv = await makeInvoice(fx, card, ref);
  return db.transaction.create({
    data: {
      familyId: fx.family.id,
      kind: "EXPENSE",
      direction: "DEBIT",
      cardId: card.id,
      invoiceId: inv.id,
      categoryId: await catId(),
      amountInCents: 10000n,
      occurredOn: new Date("2026-11-10T00:00:00Z"),
      description: "Notebook",
      payerMemberId: fx.members[0]?.memberId as string,
      authorMemberId: fx.members[0]?.memberId as string,
      installmentPlanId: planId,
      installmentNo: no,
      installmentCount: 3,
      ...over,
    },
  });
}

describe("US-040a: gatilho de competência e CHECKs (ADR-020 §2)", () => {
  it("linha comum: competenceOn = occurredOn, mesmo quando a escrita tenta outro valor", async () => {
    const acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 0 });
    const tx = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 5000,
      occurredOn: "2026-10-03",
    });
    expect(day(tx.competenceOn)).toBe("2026-10-03");
    const forced = await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        accountId: acc.id,
        categoryId: await catId(),
        amountInCents: 100n,
        occurredOn: new Date("2026-10-04T00:00:00Z"),
        competenceOn: new Date("2030-01-01T00:00:00Z"),
        payerMemberId: fx.members[0]?.memberId as string,
        description: "x",
        authorMemberId: fx.members[0]?.memberId as string,
      },
    });
    expect(day(forced.competenceOn)).toBe("2026-10-04");
    await db.$executeRaw`UPDATE transactions SET "occurredOn" = '2026-10-09'::date WHERE id = ${tx.id}::uuid`;
    const after = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(day(after.competenceOn)).toBe("2026-10-09");
  });

  it("parcela: competenceOn = closingDate da fatura, e UPDATE manual é ignorado", async () => {
    const plan = await makePlan();
    const p = await parcel(plan.id, 2, "2026-12");
    expect(day(p.competenceOn)).toBe("2026-12-25");
    await db.$executeRaw`UPDATE transactions SET "competenceOn" = '2031-01-01'::date WHERE id = ${p.id}::uuid`;
    expect(
      day((await db.transaction.findUniqueOrThrow({ where: { id: p.id } })).competenceOn),
    ).toBe("2026-12-25");
  });

  it("soft delete também passa pelo gatilho sem alterar a competência", async () => {
    const plan = await makePlan();
    const p = await parcel(plan.id, 1, "2026-11");
    await db.$executeRaw`UPDATE transactions SET "deletedAt" = now(), "deletedByMemberId" = ${fx.members[0]?.memberId}::uuid, "deletionReason" = 'DELETED' WHERE id = ${p.id}::uuid`;
    expect(
      day((await db.transaction.findUniqueOrThrow({ where: { id: p.id } })).competenceOn),
    ).toBe("2026-11-25");
  });

  it("compra à vista de cartão (sem plano) conta pela própria data", async () => {
    const t = await makeCardPurchase(fx, { card, amountInCents: 1000, occurredOn: "2026-11-28" });
    expect(day(t.competenceOn)).toBe("2026-11-28");
  });

  it("CHECK da forma: no > count, sem cartão e coluna parcial são recusados", async () => {
    const plan = await makePlan();
    await expect(parcel(plan.id, 4, "2026-11")).rejects.toThrow();
    await expect(parcel(plan.id, 1, "2026-11", { installmentCount: 1 })).rejects.toThrow();
    await expect(parcel(plan.id, 1, "2026-11", { installmentCount: null })).rejects.toThrow();
    await expect(parcel(plan.id, 1, "2026-11", { installmentNo: null })).rejects.toThrow();
    const acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 0 });
    await expect(
      db.transaction.create({
        data: {
          familyId: fx.family.id,
          kind: "EXPENSE",
          direction: "DEBIT",
          accountId: acc.id,
          categoryId: await catId(),
          amountInCents: 100n,
          occurredOn: new Date("2026-10-04T00:00:00Z"),
          description: "x",
          authorMemberId: fx.members[0]?.memberId as string,
          installmentPlanId: plan.id,
          installmentNo: 1,
          installmentCount: 3,
        },
      }),
    ).rejects.toThrow();
  });

  it("unicidade (plano, no) e CHECKs do plano", async () => {
    const plan = await makePlan();
    await parcel(plan.id, 1, "2026-11");
    await expect(parcel(plan.id, 1, "2026-12")).rejects.toThrow();
    await expect(makePlan(1, 3)).rejects.toThrow(); // total < count
    await expect(makePlan(30000, 1)).rejects.toThrow();
    await expect(makePlan(30000, 25)).rejects.toThrow();
  });

  it("migração retropreenchida: linhas existentes têm competenceOn = occurredOn", async () => {
    const rows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM transactions WHERE "installmentPlanId" IS NULL AND "competenceOn" <> "occurredOn"`;
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
