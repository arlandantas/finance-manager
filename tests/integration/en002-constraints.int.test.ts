import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
let acc: AccountFixture;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ splitEngine: "LEGACY" });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 100000 });
});

/** Cria a despesa comum e o rateio na MESMA transação (a conferência é deferida até o COMMIT). */
const write = (
  amount: number,
  splits: Array<{ member: "Mariana" | "Lucas"; bps: number; amount: number }>,
  o: { mode?: "NONE" | "RULE" | "CUSTOM"; shared?: boolean; kind?: "EXPENSE" | "INCOME" } = {},
) =>
  db.$transaction(async (tx) => {
    const category = await tx.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: o.kind === "INCOME" ? "Salário" : "Moradia" },
    });
    const row = await tx.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: o.kind ?? "EXPENSE",
        direction: o.kind === "INCOME" ? "CREDIT" : "DEBIT",
        accountId: acc.id,
        categoryId: category.id,
        amountInCents: BigInt(amount),
        occurredOn: new Date("2026-10-10T00:00:00Z"),
        description: "Teste",
        payerMemberId: mid("Mariana"),
        authorMemberId: mid("Mariana"),
        isSharedExpense: o.shared ?? (o.mode ?? "RULE") !== "NONE",
        splitMode: o.mode ?? "RULE",
      },
    });
    for (const s of splits) {
      await tx.transactionSplit.create({
        data: {
          transactionId: row.id,
          familyId: fx.family.id,
          memberId: mid(s.member),
          bps: s.bps,
          amountInCents: BigInt(s.amount),
        },
      });
    }
    return row;
  });

const ok = [
  { member: "Mariana" as const, bps: 5000, amount: 5001 },
  { member: "Lucas" as const, bps: 5000, amount: 5000 },
];

describe("EN-002a: constraint triggers do rateio (SDD-015 §8.2, infra)", () => {
  it("rateio válido (Σ bps = 10000 e Σ valores = valor) é aceito", async () => {
    const row = await write(10001, ok);
    expect(await db.transactionSplit.count({ where: { transactionId: row.id } })).toBe(2);
  });
  it("Σ bps ≠ 10000 => erro no COMMIT", async () => {
    await expect(
      write(10001, [
        { ...ok[0]!, bps: 5000 },
        { ...ok[1]!, bps: 4000 },
      ]),
    ).rejects.toThrow(/rateio inválido/);
  });
  it("Σ valores ≠ valor do lançamento => erro no COMMIT", async () => {
    await expect(write(10001, [ok[0]!, { ...ok[1]!, amount: 4999 }])).rejects.toThrow(
      /rateio inválido/,
    );
  });
  it("lançamento comum sem nenhuma linha de rateio => erro no COMMIT", async () => {
    await expect(write(10001, [])).rejects.toThrow(/rateio inválido/);
  });
  it("rateio em lançamento NONE => erro", async () => {
    await expect(write(10001, ok, { mode: "NONE" })).rejects.toThrow(/sem divisão/);
  });
  it("rateio em receita => erro (só despesa tem divisão)", async () => {
    await expect(
      write(10001, ok, { kind: "INCOME", mode: "RULE", shared: false }),
    ).rejects.toThrow();
    await expect(
      write(10001, ok, { kind: "INCOME", mode: "RULE", shared: true }),
    ).rejects.toThrow();
  });
  it("splitMode <> NONE exige isSharedExpense (CHECK)", async () => {
    await expect(write(10001, ok, { mode: "RULE", shared: false })).rejects.toThrow(
      /tx_split_kind_chk/,
    );
  });
  it("bps fora de 0..10000 e valor negativo => CHECK", async () => {
    await expect(
      write(10001, [
        { ...ok[0]!, bps: 10001 },
        { ...ok[1]!, bps: -1 },
      ]),
    ).rejects.toThrow();
  });
  it("editar o valor sem recalcular o rateio => erro no COMMIT", async () => {
    const row = await write(10001, ok);
    await expect(
      db.transaction.update({ where: { id: row.id }, data: { amountInCents: 20000n } }),
    ).rejects.toThrow(/rateio inválido/);
    expect(
      Number((await db.transaction.findUniqueOrThrow({ where: { id: row.id } })).amountInCents),
    ).toBe(10001);
  });
  it("editar valor E rateio na mesma transação é aceito", async () => {
    const row = await write(10001, ok);
    await db.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id: row.id }, data: { amountInCents: 20000n } });
      await tx.transactionSplit.deleteMany({ where: { transactionId: row.id } });
      await tx.transactionSplit.createMany({
        data: [
          {
            transactionId: row.id,
            familyId: fx.family.id,
            memberId: mid("Mariana"),
            bps: 5000,
            amountInCents: 10000n,
          },
          {
            transactionId: row.id,
            familyId: fx.family.id,
            memberId: mid("Lucas"),
            bps: 5000,
            amountInCents: 10000n,
          },
        ],
      });
    });
    expect(
      Number(
        (
          await db.transactionSplit.aggregate({
            where: { transactionId: row.id },
            _sum: { amountInCents: true },
          })
        )._sum.amountInCents,
      ),
    ).toBe(20000);
  });
  it("lançamento comum legado (NONE + isSharedExpense) continua válido (expansão)", async () => {
    const t = await makeTransaction(fx, {
      account: acc,
      category: "Moradia",
      amountInCents: 5000,
      occurredOn: "2026-10-10",
    });
    expect(t.splitMode).toBe("NONE");
    expect(t.isSharedExpense).toBe(true);
    const fam = await db.family.findUniqueOrThrow({ where: { id: fx.family.id } });
    expect(["LEGACY", "STORED"]).toContain(fam.splitEngine);
  });
  it("ex-membro mantém o rateio (FK RESTRICT; membro nunca apagado)", async () => {
    const row = await write(10001, ok);
    await expect(
      db.$executeRaw`DELETE FROM members WHERE id = ${mid("Lucas")}::uuid`,
    ).rejects.toThrow();
    expect(await db.transactionSplit.count({ where: { transactionId: row.id } })).toBe(2);
  });
});
