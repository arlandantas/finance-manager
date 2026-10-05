import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeFamily, makeTransaction } from "../support/factories";

const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

const getRule = (as: ReturnType<typeof mariana>) => at(() => call(as, "GET", "/api/v1/split-rule"));
const putRule = (as: ReturnType<typeof mariana>, body: unknown, opts = {}) =>
  at(() => call(as, "PUT", "/api/v1/split-rule", body, opts));
const sixty = () => [
  { memberId: fx.byName.Mariana?.memberId, bps: 6000 },
  { memberId: fx.byName.Lucas?.memberId, bps: 4000 },
];

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

describe("US-008 Regra de divisão familiar", () => {
  it("Padrão igualitário: família nova => EQUAL desde 1970-01-01, partes iguais derivadas", async () => {
    const res = await getRule(lucas());
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ kind: "EQUAL", effectiveFrom: "1970-01-01" });
    expect(res.body.current.shares.map((s: { bps: number }) => s.bps)).toEqual([5000, 5000]);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual([
      "Mariana Silva",
      "Lucas Silva",
    ]);
    expect(res.body.stale).toBe(false);
    expect(res.body.upcoming).toEqual([]);
  });

  it("Definir divisão proporcional: PUT 6000/4000 => 201, nova versão, painel usa 60/40", async () => {
    const res = await putRule(mariana(), { kind: "PROPORTIONAL", shares: sixty() });
    expect(res.status).toBe(201);
    expect(res.body.rule.current).toMatchObject({
      kind: "PROPORTIONAL",
      effectiveFrom: "2026-10-04",
    });
    expect(res.body.rule.current.createdBy.name).toBe("Mariana Silva");
    expect(await db.splitRuleVersion.count({ where: { familyId: fx.family.id } })).toBe(2);
    expect(await db.splitShare.count()).toBe(2);
    const settlement = await at(() => call(lucas(), "GET", "/api/v1/settlement"));
    expect(settlement.body.rule.kind).toBe("PROPORTIONAL");
  });

  it("Percentuais não somam 100%: 400 e a regra anterior é mantida", async () => {
    const res = await putRule(mariana(), {
      kind: "PROPORTIONAL",
      shares: [
        { memberId: fx.byName.Mariana?.memberId, bps: 6000 },
        { memberId: fx.byName.Lucas?.memberId, bps: 3000 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Os percentuais precisam somar 100%");
    const after = await getRule(mariana());
    expect(after.body.current.kind).toBe("EQUAL");
    expect(await db.splitRuleVersion.count()).toBe(1);
  });

  it("Percentual inválido: -1000 e 11000 => mensagem exata", async () => {
    for (const bps of [-1000, 11000]) {
      const res = await putRule(mariana(), {
        kind: "PROPORTIONAL",
        shares: [
          { memberId: fx.byName.Mariana?.memberId, bps },
          { memberId: fx.byName.Lucas?.memberId, bps: 4000 },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe("Informe um percentual entre 0% e 100%");
    }
  });

  it("Membro sem permissão: PUT como MEMBER => 403; GET => 200 com canEdit=false", async () => {
    const res = await putRule(lucas(), { kind: "EQUAL" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    const got = await getRule(lucas());
    expect(got.status).toBe(200);
    expect(got.body.canEdit).toBe(false);
    expect((await getRule(mariana())).body.canEdit).toBe(true);
  });

  it("Novo membro entra na família: regra PROPORTIONAL fica stale; o cálculo segue", async () => {
    await putRule(mariana(), { kind: "PROPORTIONAL", shares: sixty() });
    const user = await db.user.create({
      data: { email: "terceiro@exemplo.com", name: "Terceiro" },
    });
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.id,
        role: "MEMBER",
        joinedAt: new Date("2026-10-04T12:00:00Z"),
      },
    });
    expect((await getRule(mariana())).body.stale).toBe(true);
    const settlement = await at(() => call(mariana(), "GET", "/api/v1/settlement"));
    expect(settlement.body.rule.stale).toBe(true);
    expect(settlement.body.members).toHaveLength(3);
  });

  it("Vigência: effectiveFrom futura aparece em upcoming; passada (antes do período corrente) => 422", async () => {
    const future = await putRule(mariana(), {
      kind: "PROPORTIONAL",
      shares: sixty(),
      effectiveFrom: "2026-10-20",
    });
    expect(future.status).toBe(201);
    expect(future.body.rule.current.kind).toBe("EQUAL");
    expect(future.body.rule.upcoming).toHaveLength(1);
    expect(future.body.rule.upcoming[0].effectiveFrom).toBe("2026-10-20");
    const past = await putRule(mariana(), { kind: "EQUAL", effectiveFrom: "2026-09-30" });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe("EFFECTIVE_FROM_IN_PAST");
    expect(past.body.error.message).toBe("A regra só pode valer a partir do período atual");
    const startOfPeriod = await putRule(mariana(), { kind: "EQUAL", effectiveFrom: "2026-10-01" });
    expect(startOfPeriod.status).toBe(201);
  });

  it("Mudança de regra não altera meses passados (mês de setembro recalculado idêntico)", async () => {
    // fábrica (e não `db.transaction.create`): grava o rateio quando a família é STORED (TEST_SPLIT_ENGINE)
    const account = await makeAccount(fx, { name: "Conta", owner: "Mariana" });
    await makeTransaction(fx, {
      account,
      category: "Supermercado",
      amountInCents: 100000,
      occurredOn: "2026-09-10",
      author: "Mariana",
      payer: "Mariana",
      description: "Mercado",
      createdAt: new Date(Date.UTC(2026, 8, 1, 12, 0, 1)),
    });
    const before = await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-09"));
    expect(before.body.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      50000, 50000,
    ]);
    const put = await putRule(mariana(), {
      kind: "PROPORTIONAL",
      shares: sixty(),
      effectiveFrom: "2026-10-01",
    });
    expect(put.status).toBe(201);
    const after = await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-09"));
    expect(after.body).toEqual(before.body);
  });

  it("Cobertura de membros: faltando um / membro de outra família => 422 SHARES_MEMBER_MISMATCH", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const missing = await putRule(mariana(), {
      kind: "PROPORTIONAL",
      shares: [{ memberId: fx.byName.Mariana?.memberId, bps: 10000 }],
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("SHARES_MEMBER_MISMATCH");
    expect(missing.body.error.message).toBe("Informe o percentual de todos os membros");
    const alien = await putRule(mariana(), {
      kind: "PROPORTIONAL",
      shares: [
        { memberId: fx.byName.Mariana?.memberId, bps: 6000 },
        { memberId: other.members[0]?.memberId, bps: 4000 },
      ],
    });
    expect(alien.status).toBe(422);
    expect(alien.body.error.code).toBe("SHARES_MEMBER_MISMATCH");
  });

  it("Append-only: duas PUT mantêm as duas versões e a regra de 1970", async () => {
    await putRule(mariana(), { kind: "PROPORTIONAL", shares: sixty() });
    await putRule(mariana(), { kind: "EQUAL" });
    const versions = await db.splitRuleVersion.findMany({ orderBy: { createdAt: "asc" } });
    expect(versions.map((v) => v.kind)).toEqual(["EQUAL", "PROPORTIONAL", "EQUAL"]);
    expect((await getRule(mariana())).body.current.kind).toBe("EQUAL");
  });

  it("Corpo inválido: .strict() rejeita familyId; Idempotency-Key é obrigatória; mesma chave repete", async () => {
    expect((await putRule(mariana(), { kind: "EQUAL", familyId: fx.family.id })).status).toBe(400);
    expect(
      (await putRule(mariana(), { kind: "EQUAL" }, { idempotencyKey: null })).body.error.code,
    ).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const key = crypto.randomUUID();
    const a = await putRule(
      mariana(),
      { kind: "PROPORTIONAL", shares: sixty() },
      { idempotencyKey: key },
    );
    const b = await putRule(
      mariana(),
      { kind: "PROPORTIONAL", shares: sixty() },
      { idempotencyKey: key },
    );
    expect(a.status).toBe(201);
    expect(b.headers.get("Idempotent-Replay")).toBe("true");
    expect(await db.splitRuleVersion.count()).toBe(2);
  });

  it("Isolamento: a regra da Família A é invisível para a B", async () => {
    await putRule(mariana(), { kind: "PROPORTIONAL", shares: sixty() });
    const b = await makeFamily({ uniqueEmails: true, name: "Família B" });
    const res = await getRule(b.members[0]?.as ?? null);
    expect(res.body.current.kind).toBe("EQUAL");
    expect(res.body.upcoming).toEqual([]);
  });
});
