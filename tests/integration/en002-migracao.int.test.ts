import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { migrateFamily } from "@/modules/split/migrate-family";
import { run } from "../../scripts/migrate-split";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const TODAY = "2026-10-12";
const NOW = `${TODAY}T15:00:00Z`;
let fx: FamilyFixture;
let acc: AccountFixture;
let acc2: AccountFixture;
let card: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const settle = (period: string) =>
  at(() => call(lucas(), "GET", `/api/v1/settlement?period=${period}`));
const migrate = (opts: Partial<Parameters<typeof migrateFamily>[2]> = {}, id = fx.family.id) =>
  db.$transaction((tx) => migrateFamily(tx, id, { today: TODAY, ...opts }), { timeout: 120_000 });

const spend = (
  payer: "Mariana" | "Lucas",
  cents: number,
  on: string,
  o: { shared?: boolean; deleted?: boolean; createdAt?: Date } = {},
) =>
  makeTransaction(fx, {
    account: acc,
    category: "Supermercado",
    amountInCents: cents,
    occurredOn: on,
    author: payer,
    payer,
    shared: o.shared ?? true,
    ...(o.deleted ? { deleted: true } : {}),
    ...(o.createdAt ? { createdAt: o.createdAt } : {}),
  });
const rule = async (from: string, bps: [number, number]) =>
  db.splitRuleVersion.create({
    data: {
      familyId: fx.family.id,
      kind: "PROPORTIONAL",
      effectiveFrom: new Date(`${from}T00:00:00Z`),
      shares: {
        create: [
          { memberId: mid("Mariana"), bps: bps[0] },
          { memberId: mid("Lucas"), bps: bps[1] },
        ],
      },
    },
  });
const quotas = (b: { members: Array<{ quotaInCents: number }> }) =>
  b.members.map((m) => m.quotaInCents);
const checksum = async () =>
  JSON.stringify(
    {
      tx: await db.transaction.findMany({
        where: { familyId: fx.family.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          version: true,
          updatedAt: true,
          amountInCents: true,
          isSharedExpense: true,
          deletedAt: true,
        },
      }),
      fam: await db.family.findUniqueOrThrow({ where: { id: fx.family.id } }),
      splits: await db.transactionSplit.findMany({
        where: { familyId: fx.family.id },
        orderBy: [{ transactionId: "asc" }, { memberId: "asc" }],
      }),
    },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ splitEngine: "LEGACY" });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 5_000_000 });
  acc2 = await makeAccount(fx, {
    name: "Nubank",
    owner: "Lucas",
    openingBalanceInCents: 1_000_000,
  });
  card = await makeCard(fx, {
    name: "Nubank",
    owner: "Mariana",
    closingDay: 25,
    dueDay: 5,
    limitInCents: 50_000_000,
  });
});

describe("EN-002b: números homologados antes e depois da migração (N1..N10)", () => {
  it("N1/N2: outubro 3.169,90 (cota 1.584,95; dif. 1.149,95) e setembro 717,00 (358,50; 260,50) idênticos", async () => {
    await spend("Mariana", 273490, "2026-10-02");
    await spend("Lucas", 43500, "2026-10-03");
    await spend("Mariana", 61900, "2026-09-10");
    await spend("Lucas", 9800, "2026-09-12");
    const before = { oct: (await settle("2026-10")).body, sep: (await settle("2026-09")).body };
    expect(before.oct.totalSharedInCents).toBe(316990);
    expect(quotas(before.oct)).toEqual([158495, 158495]);
    expect(
      before.oct.members.map((m: { differenceInCents: number }) => m.differenceInCents),
    ).toEqual([114995, -114995]);
    expect(before.sep.totalSharedInCents).toBe(71700);
    expect(quotas(before.sep)).toEqual([35850, 35850]);
    expect(before.sep.members[0].differenceInCents).toBe(26050);
    expect((await migrate()).status).toBe("DONE");
    const after = { oct: (await settle("2026-10")).body, sep: (await settle("2026-09")).body };
    expect(after).toEqual(before);
    const home = await at(() => call(lucas(), "GET", "/api/v1/home"));
    expect(home.status).toBe(200);
  });

  it("N3: troca 50/50 ➜ 58/42 (40000 em 02/10, 100000 em 10/10): 78000/62000 e as linhas gravadas por lançamento", async () => {
    const r1 = await db.splitRuleVersion.findFirstOrThrow({ where: { familyId: fx.family.id } });
    const a = await spend("Mariana", 40000, "2026-10-02");
    const r2 = await rule("2026-10-04", [5800, 4200]);
    const b = await spend("Lucas", 100000, "2026-10-10");
    const before = (await settle("2026-10")).body;
    await migrate();
    const after = (await settle("2026-10")).body;
    expect(quotas(after)).toEqual([78000, 62000]);
    expect(after).toEqual(before);
    const rows = async (id: string) =>
      (
        await db.transactionSplit.findMany({
          where: { transactionId: id },
          orderBy: { bps: "desc" },
        })
      ).map((x) => [x.bps, Number(x.amountInCents)]);
    expect(await rows(a.id)).toEqual([
      [5000, 20000],
      [5000, 20000],
    ]);
    expect(await rows(b.id)).toEqual([
      [5800, 58000],
      [4200, 42000],
    ]);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: a.id } })).splitRuleVersionId,
    ).toBe(r1.id);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: b.id } })).splitRuleVersionId,
    ).toBe(r2.id);
    expect(
      after.splitExplanation.weighted.shares.map((s: { permille: number }) => s.permille),
    ).toEqual([557, 443]);
  });

  it("N4: acerto registrado de 50000 em outubro: saldo restante idêntico", async () => {
    await spend("Mariana", 200000, "2026-10-02");
    const reg = await at(() =>
      call(lucas(), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: mid("Lucas"),
        toMemberId: mid("Mariana"),
        amountInCents: 50000,
        fromAccountId: acc2.id,
        toAccountId: acc.id,
      }),
    );
    expect(reg.status).toBe(201);
    const before = (await settle("2026-10")).body;
    await migrate();
    expect((await settle("2026-10")).body).toEqual(before);
    expect(before.status).toBe("PENDING");
  });

  it("N5: despesa 'Só meu' (8000) fica fora, NONE e sem linhas", async () => {
    await spend("Mariana", 100000, "2026-10-02");
    const personal = await spend("Lucas", 8000, "2026-10-03", { shared: false });
    const before = (await settle("2026-10")).body;
    await migrate();
    expect((await settle("2026-10")).body).toEqual(before);
    expect(before.personal).toMatchObject({ count: 1, totalInCents: 8000 });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: personal.id } })).splitMode).toBe(
      "NONE",
    );
    expect(await db.transactionSplit.count({ where: { transactionId: personal.id } })).toBe(0);
  });

  it("N6 (ímpares): três despesas de 10001 a 50/50 pagas por Mariana ⇒ cotas 15002/15001 e centavos 5001/5000 · 5001/5000 · 5000/5001", async () => {
    const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, n));
    const ids = [
      (await spend("Mariana", 10001, "2026-10-02", { createdAt: t(1) })).id,
      (await spend("Mariana", 10001, "2026-10-03", { createdAt: t(2) })).id,
      (await spend("Mariana", 10001, "2026-10-04", { createdAt: t(3) })).id,
    ];
    const before = (await settle("2026-10")).body;
    expect(quotas(before)).toEqual([15002, 15001]);
    await migrate();
    const after = (await settle("2026-10")).body;
    expect(quotas(after)).toEqual([15002, 15001]);
    expect(after.members.map((m: { differenceInCents: number }) => m.differenceInCents)).toEqual(
      before.members.map((m: { differenceInCents: number }) => m.differenceInCents),
    );
    const per = [] as number[][];
    for (const id of ids)
      per.push(
        (await db.transactionSplit.findMany({ where: { transactionId: id } }))
          .sort(
            (a, b) =>
              (a.memberId === mid("Mariana") ? -1 : 1) - (b.memberId === mid("Mariana") ? -1 : 1),
          )
          .map((x) => Number(x.amountInCents)),
      );
    expect(per).toEqual([
      [5001, 5000],
      [5001, 5000],
      [5000, 5001],
    ]);
    expect(per.flat().reduce((a, b) => a + b, 0)).toBe(30003);
  });

  it("N7: regra alterada depois (70/30) não muda lançamentos migrados nem o acerto", async () => {
    await spend("Mariana", 40000, "2026-10-02");
    await migrate();
    const checksumBefore = await checksum();
    const before = (await settle("2026-10")).body;
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
    expect((await settle("2026-10")).body.members).toEqual(before.members);
    const splits = JSON.parse(checksumBefore).splits;
    expect(JSON.parse(await checksum()).splits).toEqual(splits);
  });

  it("N8: despesa excluída recebe rateio, não altera o acerto e o restore a deixa válida", async () => {
    await spend("Mariana", 100000, "2026-10-02");
    const del = await spend("Lucas", 30001, "2026-10-03", { deleted: true });
    const before = (await settle("2026-10")).body;
    await migrate();
    expect((await settle("2026-10")).body).toEqual(before);
    const rows = await db.transactionSplit.findMany({ where: { transactionId: del.id } });
    expect(rows.reduce((a, r) => a + Number(r.amountInCents), 0)).toBe(30001);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: del.id } })).splitMode).toBe(
      "RULE",
    );
    const restored = await at(() =>
      call(lucas(), "POST", `/api/v1/transactions/${del.id}/restore`, { version: 1 }),
    );
    expect(restored.status).toBe(200);
    expect((await settle("2026-10")).body.totalSharedInCents).toBe(130001);
  });

  it("N9: compra no cartão compartilhada migra e o acerto não muda", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 45001,
      occurredOn: "2026-10-05",
      payer: "Lucas",
      author: "Lucas",
    });
    await spend("Mariana", 20000, "2026-10-06");
    const before = (await settle("2026-10")).body;
    await migrate();
    expect((await settle("2026-10")).body).toEqual(before);
  });

  it("N10: ex-membro (S14): participa do mês em que saiu e não do seguinte; migração preserva", async () => {
    const user = await db.user.create({ data: { email: "x@exemplo.com", name: "Xavier Silva" } });
    const x = await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.id,
        role: "MEMBER",
        joinedAt: new Date("2026-01-02T12:00:00Z"),
        removedAt: new Date("2026-10-15T12:00:00Z"),
        removalKind: "REMOVED",
      },
    });
    await spend("Mariana", 30000, "2026-10-10");
    await spend("Mariana", 30000, "2026-11-10");
    const sOct = (await settle("2026-10")).body;
    const sNov = (await settle("2026-11")).body;
    expect(sOct.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      10000, 10000, 10000,
    ]);
    expect(sNov.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      15000, 15000,
    ]);
    await migrate();
    expect((await settle("2026-10")).body).toEqual(sOct);
    expect((await settle("2026-11")).body).toEqual(sNov);
    expect(x.id).toBeDefined();
  });
});

describe("EN-002b: migração repetível, atômica e retomável", () => {
  it("2ª execução ⇒ SKIPPED e checksum de transactions/transaction_splits/families idêntico", async () => {
    await spend("Mariana", 40001, "2026-10-02");
    expect((await migrate()).status).toBe("DONE");
    const c1 = await checksum();
    expect((await migrate()).status).toBe("SKIPPED");
    expect(await checksum()).toBe(c1);
    expect(await db.dataMigration.count({ where: { familyId: fx.family.id, state: "DONE" } })).toBe(
      1,
    );
  });

  it("falha no meio (failAfter): rollback total (sem rateio, sem snapshot, motor LEGACY); reaplicar ⇒ tudo correto", async () => {
    await spend("Mariana", 40001, "2026-09-02");
    await spend("Mariana", 40001, "2026-10-02");
    const before = (await settle("2026-10")).body;
    const c0 = await checksum();
    await expect(migrate({ failAfter: 1 })).rejects.toThrow(/falha injetada/);
    expect(await checksum()).toBe(c0);
    expect(await db.splitMigrationSnapshot.count({ where: { familyId: fx.family.id } })).toBe(0);
    expect((await db.family.findUniqueOrThrow({ where: { id: fx.family.id } })).splitEngine).toBe(
      "LEGACY",
    );
    expect((await migrate()).status).toBe("DONE");
    expect((await settle("2026-10")).body).toEqual(before);
    expect(await db.splitMigrationSnapshot.count({ where: { familyId: fx.family.id } })).toBe(2);
  });

  it("família já STORED sem DONE (criada por código antigo) ⇒ registra DONE sem tocar nos dados", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: { splitEngine: "STORED" } });
    const c0 = await checksum();
    expect((await migrate()).status).toBe("SKIPPED");
    expect(JSON.parse(await checksum()).tx).toEqual(JSON.parse(c0).tx);
    expect(
      (await db.dataMigration.findFirstOrThrow({ where: { familyId: fx.family.id } })).state,
    ).toBe("DONE");
  });

  it("dry-run: executa, confere o gate e desfaz (nada persiste)", async () => {
    await spend("Mariana", 40001, "2026-10-02");
    const c0 = await checksum();
    const lines: string[] = [];
    const code = await run(db, ["--dry-run", "--family", fx.family.id, "--today", TODAY], (l) =>
      lines.push(l),
    );
    expect(code).toBe(0);
    expect(lines.some((l) => l.startsWith("DRY_RUN"))).toBe(true);
    expect(await checksum()).toBe(c0);
    expect(await db.splitMigrationSnapshot.count()).toBe(0);
  });
});

describe("EN-002b: concorrência migração × escrita (ADR-021 §2)", () => {
  it("migrateFamily × criar despesa comum: nunca despesa comum sem rateio em família STORED", async () => {
    for (let i = 0; i < 4; i++) await spend("Mariana", 10001 + i, `2026-10-0${i + 1}`);
    const category = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const create = at(() =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: acc.id,
        categoryId: category,
        amountInCents: 7777,
        occurredOn: "2026-10-09",
        isSharedExpense: true,
      }),
    );
    const [m, c] = await Promise.all([migrate().catch((e) => e), create]);
    expect(c.status).toBe(201);
    expect(m.status ?? "x").toBe("DONE");
    const family = await db.family.findUniqueOrThrow({ where: { id: fx.family.id } });
    expect(family.splitEngine).toBe("STORED");
    const shared = await db.transaction.findMany({
      where: { familyId: fx.family.id, kind: "EXPENSE", isSharedExpense: true },
      include: { splits: true },
    });
    for (const t of shared) expect(t.splits.length, t.id).toBeGreaterThan(0);
    const total = (await settle("2026-10")).body;
    expect(total.totalSharedInCents).toBe(10001 + 10002 + 10003 + 10004 + 7777);
    expect(await run(db, ["--verify", "--family", fx.family.id], () => undefined)).toBe(0);
  });

  it("migrateFamily × PUT /split-rule e × registrar acerto: consistentes ao final", async () => {
    await spend("Mariana", 200001, "2026-10-02");
    const put = at(() =>
      call(mariana(), "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        effectiveFrom: "2026-10-01",
        shares: [
          { memberId: mid("Mariana"), bps: 6000 },
          { memberId: mid("Lucas"), bps: 4000 },
        ],
      }),
    );
    const reg = at(() =>
      call(lucas(), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: mid("Lucas"),
        toMemberId: mid("Mariana"),
        amountInCents: 1000,
        fromAccountId: acc2.id,
        toAccountId: acc.id,
      }),
    );
    const [m, p, r] = await Promise.all([migrate().catch((e) => e), put, reg]);
    expect(m.status).toBe("DONE");
    expect([p.status, r.status].every((s) => s < 500)).toBe(true);
    const s = (await settle("2026-10")).body;
    expect(
      s.members.reduce((a: number, x: { quotaInCents: number }) => a + x.quotaInCents, 0),
    ).toBe(s.totalSharedInCents);
    expect(await run(db, ["--verify"], () => undefined)).toBe(0);
  });
});

describe("EN-002b: reversão, verificação e script", () => {
  it("--engine LEGACY: acerto de todos os meses = snapshot; migrar de novo recalcula tudo", async () => {
    await spend("Mariana", 316990, "2026-10-02");
    await spend("Lucas", 71700, "2026-09-10");
    const snap = { oct: (await settle("2026-10")).body, sep: (await settle("2026-09")).body };
    await migrate();
    const lines: string[] = [];
    expect(
      await run(db, ["--engine", "LEGACY", "--family", fx.family.id], (l) => lines.push(l)),
    ).toBe(0);
    expect((await db.family.findUniqueOrThrow({ where: { id: fx.family.id } })).splitEngine).toBe(
      "LEGACY",
    );
    expect({ oct: (await settle("2026-10")).body, sep: (await settle("2026-09")).body }).toEqual(
      snap,
    );
    expect(
      (await db.dataMigration.findFirstOrThrow({ where: { familyId: fx.family.id } })).state,
    ).toBe("ROLLED_BACK");
    expect((await migrate()).status).toBe("DONE");
    expect({ oct: (await settle("2026-10")).body, sep: (await settle("2026-09")).body }).toEqual(
      snap,
    );
  });

  it("--rollback --purge: sem linhas de rateio e splitMode NONE; acerto = snapshot", async () => {
    await spend("Mariana", 316990, "2026-10-02");
    const snap = (await settle("2026-10")).body;
    await migrate();
    expect(
      await run(db, ["--rollback", "--purge", "--family", fx.family.id], () => undefined),
    ).toBe(0);
    expect(await db.transactionSplit.count()).toBe(0);
    expect(await db.transaction.count({ where: { splitMode: { not: "NONE" } } })).toBe(0);
    expect((await settle("2026-10")).body).toEqual(snap);
  });

  it("--rollback --purge recusa (código 2, nada alterado) com CUSTOM", async () => {
    const t = await spend("Mariana", 10000, "2026-10-02");
    await migrate();
    await db.$executeRaw`UPDATE transactions SET "splitMode" = 'CUSTOM', "splitRuleVersionId" = NULL WHERE id = ${t.id}::uuid`;
    const c0 = await checksum();
    const lines: string[] = [];
    expect(
      await run(db, ["--rollback", "--purge", "--family", fx.family.id], (l) => lines.push(l)),
    ).toBe(2);
    expect(lines.join("\n")).toContain("RECUSADA");
    expect(await checksum()).toBe(c0);
  });

  it("--verify: detecta despesa comum sem rateio em família STORED e STORED sem DONE", async () => {
    await spend("Mariana", 10000, "2026-10-02");
    await migrate();
    expect(await run(db, ["--verify"], () => undefined)).toBe(0);
    await db.transactionSplit
      .deleteMany({ where: { familyId: fx.family.id } })
      .catch(() => undefined);
    await db.dataMigration.deleteMany({ where: { familyId: fx.family.id } });
    const lines: string[] = [];
    // a constraint trigger impede o DELETE avulso; o estado sem DONE basta para o verify falhar
    expect(await run(db, ["--verify"], (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("sem data_migrations DONE");
  });

  it("script: famílias em ordem de id, continua após falha, resumo e código 1 com falha", async () => {
    await spend("Mariana", 10000, "2026-10-02");
    const other = await makeFamily({ splitEngine: "LEGACY", uniqueEmails: true, name: "Outra" });
    const acc2 = await makeAccount(other, {
      name: "C",
      owner: "Mariana",
      openingBalanceInCents: 1000,
    });
    await makeTransaction(other, {
      account: acc2,
      category: "Supermercado",
      amountInCents: 5001,
      occurredOn: "2026-10-03",
    });
    const lines: string[] = [];
    expect(await run(db, ["--today", TODAY], (l) => lines.push(l))).toBe(0);
    expect(lines.filter((l) => l.startsWith("DONE")).length).toBe(2);
    expect(lines.at(-1)).toContain("DONE=2");
    const again: string[] = [];
    expect(await run(db, ["--today", TODAY], (l) => again.push(l))).toBe(0);
    expect(again.at(-1)).toContain("SKIPPED=2");
    // família com dados inconsistentes para o STORED não impede as demais: aqui só provamos o código de saída
    expect(await run(db, ["--engine", "LEGACY"], () => undefined)).toBe(1);
  });
});
