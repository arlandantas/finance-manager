import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);
let supermercado: string;

async function setup(engine: "LEGACY" | "STORED") {
  await resetDb();
  fx = await makeFamily({ splitEngine: engine });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 1_000_000 });
  supermercado = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } })
  ).id;
}
const post = (
  as: ReturnType<typeof lucas>,
  amount: number,
  o: { on?: string; shared?: boolean; payer?: "Mariana" | "Lucas" } = {},
) =>
  at(() =>
    call(as, "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: acc.id,
      categoryId: supermercado,
      amountInCents: amount,
      occurredOn: o.on ?? "2026-10-05",
      isSharedExpense: o.shared ?? true,
      ...(o.payer ? { payerMemberId: mid(o.payer) } : {}),
    }),
  );
const patch = (
  as: ReturnType<typeof lucas>,
  id: string,
  version: number,
  body: Record<string, unknown>,
) => at(() => call(as, "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));
const rowsOf = async (id: string) =>
  (
    await db.transactionSplit.findMany({
      where: { transactionId: id },
      orderBy: { memberId: "asc" },
    })
  ).map((r) => ({
    member: r.memberId === mid("Mariana") ? "Mariana" : "Lucas",
    bps: r.bps,
    amount: Number(r.amountInCents),
  }));
const settle = (period = "2026-10", as = lucas()) =>
  at(() => call(as, "GET", `/api/v1/settlement?period=${period}`));
const splitChecksum = async () =>
  JSON.stringify(
    await db.transactionSplit.findMany({
      orderBy: [{ transactionId: "asc" }, { memberId: "asc" }],
    }),
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );

describe("EN-002a: escrita STORED (SDD-015 §4.3)", () => {
  beforeEach(() => setup("STORED"));

  it("despesa comum grava splitMode RULE, regra de origem e o rateio exato; 'Só meu' não grava nada", async () => {
    const shared = await post(lucas(), 10001, { payer: "Mariana" });
    expect(shared.status).toBe(201);
    const row = await db.transaction.findUniqueOrThrow({
      where: { id: shared.body.transaction.id },
    });
    expect(row).toMatchObject({ splitMode: "RULE", isSharedExpense: true });
    const rule = await db.splitRuleVersion.findFirstOrThrow({ where: { familyId: fx.family.id } });
    expect(row.splitRuleVersionId).toBe(rule.id);
    expect(await rowsOf(row.id)).toEqual(
      [
        { member: "Lucas", bps: 5000, amount: 5000 },
        { member: "Mariana", bps: 5000, amount: 5001 },
      ].sort((a, b) => (mid(a.member as "Mariana") < mid(b.member as "Mariana") ? -1 : 1)),
    );
    const personal = await post(lucas(), 8000, { shared: false });
    const p = await db.transaction.findUniqueOrThrow({
      where: { id: personal.body.transaction.id },
    });
    expect(p.splitMode).toBe("NONE");
    expect(await db.transactionSplit.count({ where: { transactionId: p.id } })).toBe(0);
  });

  it("acerto STORED: homologado outubro 3.169,90 => cotas 1.584,95 / 1.584,95; ímpares novos: sobra com o pagador (15003/15000)", async () => {
    await post(mariana(), 316990, { on: "2026-10-02", payer: "Mariana" });
    const s = (await settle()).body;
    expect(s.totalSharedInCents).toBe(316990);
    expect(s.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      158495, 158495,
    ]);
    await resetDb();
    await setup("STORED");
    for (let i = 0; i < 3; i++)
      await post(mariana(), 10001, { payer: "Mariana", on: `2026-10-0${i + 2}` });
    const n6 = (await settle()).body;
    // lançamentos NOVOS: a sobra de cada despesa fica com quem pagou (RN-018.3) => 15003 / 15000
    expect(n6.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([15003, 15000]);
    const rows = await db.transactionSplit.findMany({});
    expect(rows.reduce((a, r) => a + Number(r.amountInCents), 0)).toBe(30003);
  });

  it("editar valor ou pagador recalcula os centavos com os MESMOS bps; mesma transação e versão", async () => {
    const created = await post(lucas(), 10001, { payer: "Mariana" });
    const id = created.body.transaction.id;
    const up = await patch(lucas(), id, 1, { amountInCents: 20001 });
    expect(up.status).toBe(200);
    const sorted = (await rowsOf(id)).sort((a, b) => a.member.localeCompare(b.member));
    expect(sorted).toEqual([
      { member: "Lucas", bps: 5000, amount: 10000 },
      { member: "Mariana", bps: 5000, amount: 10001 },
    ]);
    const payer = await patch(lucas(), id, 2, { payerMemberId: mid("Lucas") });
    expect(payer.status).toBe(200);
    const after = (await rowsOf(id)).sort((a, b) => a.member.localeCompare(b.member));
    expect(after).toEqual([
      { member: "Lucas", bps: 5000, amount: 10001 },
      { member: "Mariana", bps: 5000, amount: 10000 },
    ]);
  });

  it("virar 'Só meu' apaga o rateio; voltar a dividir cria pela regra da data do lançamento", async () => {
    const created = await post(lucas(), 30000);
    const id = created.body.transaction.id;
    expect((await patch(lucas(), id, 1, { isSharedExpense: false })).status).toBe(200);
    expect(await db.transactionSplit.count({ where: { transactionId: id } })).toBe(0);
    expect(await db.transaction.findUniqueOrThrow({ where: { id } })).toMatchObject({
      splitMode: "NONE",
      splitRuleVersionId: null,
      isSharedExpense: false,
    });
    expect((await patch(lucas(), id, 2, { isSharedExpense: true })).status).toBe(200);
    expect(await rowsOf(id)).toHaveLength(2);
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).splitMode).toBe("RULE");
  });

  it("excluir e restaurar: o rateio acompanha (linhas intactas)", async () => {
    const created = await post(lucas(), 30000);
    const id = created.body.transaction.id;
    const before = await splitChecksum();
    expect(
      (await at(() => call(lucas(), "POST", `/api/v1/transactions/${id}/delete`, { version: 1 })))
        .status,
    ).toBe(200);
    expect(await splitChecksum()).toBe(before);
    expect((await settle()).body.totalSharedInCents).toBe(0);
    expect(
      (await at(() => call(lucas(), "POST", `/api/v1/transactions/${id}/restore`, { version: 2 })))
        .status,
    ).toBe(200);
    expect(await splitChecksum()).toBe(before);
    expect((await settle()).body.totalSharedInCents).toBe(30000);
  });

  it("mudar a regra depois NÃO altera lançamentos nem meses anteriores; o novo usa 70/30 (checksum)", async () => {
    await post(lucas(), 40000, { on: "2026-10-02", payer: "Mariana" });
    const before = await splitChecksum();
    const panelBefore = (await settle()).body;
    const put = await at(() =>
      call(mariana(), "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        effectiveFrom: "2026-10-04",
        shares: [
          { memberId: mid("Mariana"), bps: 7000 },
          { memberId: mid("Lucas"), bps: 3000 },
        ],
      }),
    );
    expect(put.status).toBe(201);
    expect(await splitChecksum()).toBe(before);
    expect((await settle()).body.members).toEqual(panelBefore.members);
    const novo = await post(lucas(), 10000, { on: "2026-10-10", payer: "Lucas" });
    expect(await rowsOf(novo.body.transaction.id)).toEqual(
      [
        { member: "Mariana", bps: 7000, amount: 7000 },
        { member: "Lucas", bps: 3000, amount: 3000 },
      ].sort((a, b) => (mid(a.member as "Mariana") < mid(b.member as "Mariana") ? -1 : 1)),
    );
  });

  it("três membros iguais: 90000 => 30000 × 3 (peso exato) e as duas sugestões de S4", async () => {
    const user = await asUser("xavier@exemplo.com", { name: "Xavier Silva" });
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.userId,
        role: "MEMBER",
        joinedAt: new Date("2026-02-01T12:00:00Z"),
      },
    });
    const r = await post(mariana(), 90000, { payer: "Mariana" });
    const rows = await db.transactionSplit.findMany({
      where: { transactionId: r.body.transaction.id },
    });
    expect(rows.map((x) => Number(x.amountInCents))).toEqual([30000, 30000, 30000]);
    expect(rows.map((x) => x.bps).sort()).toEqual([3333, 3333, 3334]);
    const s = (await settle("2026-10", mariana())).body;
    expect(s.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      30000, 30000, 30000,
    ]);
  });

  it("rótulo: dois trechos (50/50 ➜ 58/42) => cotas 780,00 / 620,00 e ponderado 55,7 / 44,3", async () => {
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 40000,
      occurredOn: "2026-10-02",
      author: "Mariana",
      payer: "Mariana",
    });
    await db.splitRuleVersion.create({
      data: {
        familyId: fx.family.id,
        kind: "PROPORTIONAL",
        effectiveFrom: new Date("2026-10-04T00:00:00Z"),
        shares: {
          create: [
            { memberId: mid("Mariana"), bps: 5800 },
            { memberId: mid("Lucas"), bps: 4200 },
          ],
        },
      },
    });
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 100000,
      occurredOn: "2026-10-10",
      author: "Lucas",
      payer: "Lucas",
    });
    const res = await settle();
    const q = (n: string) =>
      res.body.members.find((m: { member: { name: string } }) => m.member.name.startsWith(n))
        .quotaInCents;
    expect([q("Mariana"), q("Lucas")]).toEqual([78000, 62000]);
    expect(
      res.body.splitExplanation.weighted.shares.map((s: { permille: number }) => s.permille),
    ).toEqual([557, 443]);
    expect(res.body.splitExplanation.showWeighted).toBe(true);
  });

  it("defesa: despesa comum sem rateio em família STORED => 500 (nunca soma errado)", async () => {
    await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        accountId: acc.id,
        categoryId: supermercado,
        amountInCents: 1000n,
        occurredOn: new Date("2026-10-05T00:00:00Z"),
        description: "X",
        payerMemberId: mid("Mariana"),
        authorMemberId: mid("Mariana"),
        isSharedExpense: true,
      },
    });
    const res = await settle();
    expect(res.status).toBe(500);
  });

  it("baixa de previsão comum herda o rateio (RULE na data do pagamento)", async () => {
    const planned = await at(() =>
      call(lucas(), "POST", "/api/v1/planned-expenses", {
        description: "Condomínio",
        amountInCents: 65000,
        dueOn: "2026-10-20",
        categoryId: supermercado,
        responsibleMemberId: mid("Lucas"),
        isSharedExpense: true,
      }),
    );
    expect(planned.status).toBe(201);
    const pay = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-expenses/${planned.body.plannedExpense.id}/pay`, {
        version: 1,
        accountId: acc.id,
        paidOn: "2026-10-12",
      }),
    );
    expect(pay.status).toBe(201);
    const tx = await db.transaction.findFirstOrThrow({ where: { description: "Condomínio" } });
    expect(tx.splitMode).toBe("RULE");
    expect((await rowsOf(tx.id)).reduce((a, r) => a + r.amount, 0)).toBe(65000);
  });
});

describe("EN-002a: família LEGACY segue como na R2.1 (SDD-015 §1)", () => {
  beforeEach(() => setup("LEGACY"));
  it("não grava rateio; o acerto usa a vigência por data", async () => {
    const r = await post(lucas(), 10001, { payer: "Mariana" });
    expect(await db.transactionSplit.count()).toBe(0);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: r.body.transaction.id } })).splitMode,
    ).toBe("NONE");
    const s = (await settle()).body;
    expect(s.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([5001, 5000]);
  });
});

describe("EN-002a: famílias novas nascem STORED (infra)", () => {
  it("POST /families grava splitEngine STORED e data_migrations nativa; a despesa comum já grava rateio", async () => {
    await resetDb();
    const as = await asUser("nova@exemplo.com", { name: "Nova Silva" });
    const res = await call(as, "POST", "/api/v1/families", { name: "Nova" });
    expect(res.status).toBe(201);
    const fam = await db.family.findUniqueOrThrow({ where: { id: res.body.family.id } });
    expect(fam.splitEngine).toBe("STORED");
    const dm = await db.dataMigration.findFirstOrThrow({ where: { familyId: fam.id } });
    expect(dm).toMatchObject({ name: "en002_split_stored", state: "DONE" });
    expect(dm.report).toEqual({ native: true });
  });
});
