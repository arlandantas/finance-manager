import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type CardFixture,
  type FamilyFixture,
  makeCard,
  makeFamily,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

// US-099 (ADR-036, spec 12 regra 14, spec 05): a cobrança dividida entra no acerto do mês pelo rateio gravado.
const db = testDb();
const SIGNUP = "2026-12-05T15:00:00Z"; // cadastro; cobrança dia 10 => 1ª em 10/12
const DEC = "2026-12-11T15:00:00Z";
let fx: FamilyFixture;
let card: CardFixture;
let lazer: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mid = (n: string) => fx.byName[n]?.memberId as string;

const at = async <T>(iso: string, fn: () => Promise<T>): Promise<T> => {
  setDevClockOverride(iso);
  try {
    return await fn();
  } finally {
    setDevClockOverride(SIGNUP);
  }
};

async function setup(engine: "LEGACY" | "STORED" = "STORED") {
  await resetDb();
  vi.restoreAllMocks();
  setDevClockOverride(SIGNUP);
  fx = await makeFamily({ splitEngine: engine });
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  lazer = (
    await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer e restaurantes" },
    })
  ).id;
}
beforeEach(() => setup());

const create = async (over: Record<string, unknown> = {}, as = mariana(), expected = 201) => {
  const r = await call(as, "POST", "/api/v1/subscriptions", {
    cardId: card.id,
    description: "Netflix",
    amountInCents: 5590,
    categoryId: lazer,
    dayOfMonth: 10,
    end: { type: "NONE" },
    ...over,
  });
  expect(r.status).toBe(expected);
  return r.body.subscription as { id: string; version: number; isSharedExpense: boolean };
};
const patch = (id: string, body: Record<string, unknown>, as = mariana()) =>
  call(as, "PATCH", `/api/v1/subscriptions/${id}`, body);
const open = (iso: string, as = mariana()) =>
  at(iso, () => call(as, "GET", "/api/v1/transactions"));
const settle = (iso: string, period: string, as = mariana()) =>
  at(iso, () => call(as, "GET", `/api/v1/settlement?period=${period}`));
const charges = (subId: string) =>
  db.subscriptionCharge.findMany({
    where: { subscriptionId: subId },
    orderBy: { chargeMonth: "asc" },
    include: { transaction: { include: { splits: true } } },
  });
const quotas = (s: { members: Array<{ member: { id: string }; quotaInCents: number }> }) =>
  Object.fromEntries(s.members.map((m) => [m.member.id, m.quotaInCents]));

describe("US-099 AC1-3: rateio em centavos, soma exata, sobra ao pagador", () => {
  it("AC1: 55,90 a 50/50 em 10/12 => cota 2.795 para cada; crédito ao pagador", async () => {
    const sub = await create({ isSharedExpense: true });
    expect(sub.isSharedExpense).toBe(true);
    await open(DEC);
    const [c] = await charges(sub.id);
    expect(c?.status).toBe("POSTED");
    expect(c?.sharedDowngraded).toBe(false);
    expect(c?.transaction).toMatchObject({ isSharedExpense: true, splitMode: "RULE" });
    const s = (await settle(DEC, "2026-12")).body;
    expect(s.totalSharedInCents).toBe(5590);
    expect(quotas(s)).toEqual({ [mid("Mariana")]: 2795, [mid("Lucas")]: 2795 });
    const paid = Object.fromEntries(
      s.members.map((m: { member: { id: string }; paidInCents: number }) => [
        m.member.id,
        m.paidInCents,
      ]),
    );
    expect(paid).toEqual({ [mid("Mariana")]: 5590, [mid("Lucas")]: 0 });
  });

  it("abrir o Acerto direto lança a cobrança vencida (sem passar pelo Extrato)", async () => {
    await create({ isSharedExpense: true });
    const s = (await settle(DEC, "2026-12")).body;
    expect(s.totalSharedInCents).toBe(5590);
  });

  it("AC2: 55,91 a 50/50, pagador Lucas => Lucas 2.796, Mariana 2.795 (Σ = 5.591)", async () => {
    const sub = await create({
      amountInCents: 5591,
      isSharedExpense: true,
      payerMemberId: mid("Lucas"),
    });
    await open(DEC);
    const rows = (await charges(sub.id))[0]?.transaction?.splits ?? [];
    const by = Object.fromEntries(rows.map((r) => [r.memberId, Number(r.amountInCents)]));
    expect(by).toEqual({ [mid("Lucas")]: 2796, [mid("Mariana")]: 2795 });
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(5591);
    expect(quotas((await settle(DEC, "2026-12")).body)).toEqual(by);
  });

  it("AC3: três membros EQUAL, R$ 100,00 => 3.334/3.333/3.333 com a sobra ao pagador", async () => {
    const user = await asUser("xavier@exemplo.com", { name: "Xavier Silva" });
    const xavier = await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.userId,
        role: "MEMBER",
        joinedAt: new Date("2026-02-01T12:00:00Z"),
      },
    });
    const sub = await create({ amountInCents: 10000, isSharedExpense: true });
    await open(DEC);
    const rows = (await charges(sub.id))[0]?.transaction?.splits ?? [];
    const by = Object.fromEntries(rows.map((r) => [r.memberId, Number(r.amountInCents)]));
    expect(by).toEqual({ [mid("Mariana")]: 3334, [mid("Lucas")]: 3333, [xavier.id]: 3333 });
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe("US-099 AC4-5, AC7: mês da cobrança, regra vigente e alternância", () => {
  it("AC4: 'Só meu' fora do acerto; cada cobrança entra pelo seu mês", async () => {
    setDevClockOverride("2026-10-05T15:00:00Z");
    const shared = await create({ isSharedExpense: true });
    await create({ description: "Spotify", amountInCents: 2190 });
    await open("2026-12-11T15:00:00Z");
    for (const p of ["2026-10", "2026-11", "2026-12"]) {
      const s = (await settle(DEC, p)).body;
      expect(s.totalSharedInCents).toBe(5590);
      expect(quotas(s)).toEqual({ [mid("Mariana")]: 2795, [mid("Lucas")]: 2795 });
    }
    expect(await charges(shared.id)).toHaveLength(3);
  });

  it("AC5: regra muda para 60/40 em janeiro: dezembro mantém 50/50; janeiro usa 60/40", async () => {
    const sub = await create({ isSharedExpense: true });
    await open(DEC);
    const put = await at("2026-12-20T15:00:00Z", () =>
      call(mariana(), "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        effectiveFrom: "2027-01-01",
        shares: [
          { memberId: mid("Mariana"), bps: 6000 },
          { memberId: mid("Lucas"), bps: 4000 },
        ],
      }),
    );
    expect(put.status).toBe(201);
    await open("2027-01-11T15:00:00Z");
    expect(quotas((await settle(DEC, "2026-12")).body)).toEqual({
      [mid("Mariana")]: 2795,
      [mid("Lucas")]: 2795,
    });
    expect(quotas((await settle("2027-01-11T15:00:00Z", "2027-01")).body)).toEqual({
      [mid("Mariana")]: 3354,
      [mid("Lucas")]: 2236,
    });
    expect(await charges(sub.id)).toHaveLength(2);
  });

  it("AC7: alternar para dividida no dia 5: a de dia 10 sai dividida; as anteriores ficam 'Só meu'", async () => {
    setDevClockOverride("2026-10-05T15:00:00Z");
    const sub = await create();
    await open("2026-11-11T15:00:00Z");
    const res = await at("2026-12-05T15:00:00Z", () =>
      patch(sub.id, { version: 1, isSharedExpense: true }),
    );
    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({ isSharedExpense: true, version: 2 });
    await open(DEC);
    expect((await charges(sub.id)).map((c) => c.transaction?.isSharedExpense)).toEqual([
      false,
      false,
      true,
    ]);
    expect((await settle(DEC, "2026-11")).body.totalSharedInCents).toBe(0);
  });
});

describe("US-099 AC6: acerto desligado", () => {
  const disable = async () => {
    const f = await call(mariana(), "GET", "/api/v1/family");
    const r = await call(mariana(), "PATCH", "/api/v1/family/settings", {
      settlementEnabled: false,
      version: f.body.family.version,
      confirmPending: true,
    });
    expect(r.status).toBe(200);
  };

  it("POST e PATCH com isSharedExpense true => 422 SETTLEMENT_DISABLED", async () => {
    const sub = await create();
    await disable();
    const post = await call(mariana(), "POST", "/api/v1/subscriptions", {
      cardId: card.id,
      description: "Hulu",
      amountInCents: 3990,
      categoryId: lazer,
      dayOfMonth: 10,
      end: { type: "NONE" },
      isSharedExpense: true,
    });
    expect(post.status).toBe(422);
    expect(post.body.error.code).toBe("SETTLEMENT_DISABLED");
    const res = await patch(sub.id, { version: 1, isSharedExpense: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SETTLEMENT_DISABLED");
  });

  it("dividida existente lança 'Só meu' com sharedDowngraded; a assinatura não muda", async () => {
    const sub = await create({ isSharedExpense: true });
    await disable();
    await open(DEC);
    const [c] = await charges(sub.id);
    expect(c).toMatchObject({ status: "POSTED", sharedDowngraded: true });
    expect(c?.transaction).toMatchObject({ isSharedExpense: false, splitMode: "NONE" });
    expect(c?.transaction?.splits).toHaveLength(0);
    const row = await db.cardSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row.isSharedExpense).toBe(true);
    expect(row.version).toBe(1);
  });
});

describe("US-099 AC8: família LEGACY", () => {
  it("grava só isSharedExpense e o acerto LEGACY inclui a cobrança", async () => {
    await setup("LEGACY");
    const sub = await create({ isSharedExpense: true });
    await open(DEC);
    const [c] = await charges(sub.id);
    expect(c?.transaction).toMatchObject({ isSharedExpense: true, splitMode: "NONE" });
    expect(c?.transaction?.splits).toHaveLength(0);
    const s = (await settle(DEC, "2026-12")).body;
    expect(s.totalSharedInCents).toBe(5590);
    expect(quotas(s)).toEqual({ [mid("Mariana")]: 2795, [mid("Lucas")]: 2795 });
  });
});

describe("US-099: controle, varredura, reconciliação e concorrência", () => {
  it("'Só meu' alheio: outro membro não torna dividida (403); só quem pagou volta a 'Só meu'", async () => {
    const mine = await create();
    const flip = await patch(mine.id, { version: 1, isSharedExpense: true }, lucas());
    expect(flip.status).toBe(403);
    const shared = await create({ description: "Disney", isSharedExpense: true });
    const back = await patch(shared.id, { version: 1, isSharedExpense: false }, lucas());
    expect(back.status).toBe(403);
    const ok = await patch(shared.id, { version: 1, isSharedExpense: false }, mariana());
    expect(ok.status).toBe(200);
    // ninguém cadastra 'Só meu' em nome de outro; dividida em nome de outro é permitida
    await create({ payerMemberId: mid("Mariana") }, lucas(), 403);
    await create(
      { description: "Max", isSharedExpense: true, payerMemberId: mid("Mariana") },
      lucas(),
    );
  });

  it("varredura: muitos valores e regras => Σ partes = valor, acerto = Extrato = Resumo, Σ diferenças = 0", async () => {
    const rnd = mulberry32(99);
    const amounts = [1, 2, 3, 7, 99, 5591, 10000, 33333, 999999, 123456789];
    for (let i = 0; i < 14; i++) amounts.push(1 + Math.floor(rnd() * 5_000_000));
    // regra proporcional 37,13 / 62,87 vigente desde antes das cobranças
    const put = await call(mariana(), "PUT", "/api/v1/split-rule", {
      kind: "PROPORTIONAL",
      effectiveFrom: "2026-12-01",
      shares: [
        { memberId: mid("Mariana"), bps: 3713 },
        { memberId: mid("Lucas"), bps: 6287 },
      ],
    });
    expect(put.status).toBe(201);
    const ids: string[] = [];
    for (const [i, amountInCents] of amounts.entries()) {
      const payerMemberId = mid(i % 2 === 0 ? "Mariana" : "Lucas");
      ids.push(
        (
          await create({
            description: `Assinatura ${i}`,
            amountInCents,
            isSharedExpense: true,
            payerMemberId,
          })
        ).id,
      );
    }
    await open(DEC);
    const total = amounts.reduce((a, b) => a + b, 0);
    let sumQuota = 0;
    for (const id of ids) {
      const [c] = await charges(id);
      const t = c?.transaction;
      const parts = (t?.splits ?? []).map((s) => Number(s.amountInCents));
      expect(parts.reduce((a, b) => a + b, 0)).toBe(Number(t?.amountInCents));
      expect((t?.splits ?? []).reduce((a, s) => a + s.bps, 0)).toBe(10000);
      sumQuota += parts.reduce((a, b) => a + b, 0);
    }
    expect(sumQuota).toBe(total);
    const s = (await settle(DEC, "2026-12")).body;
    expect(s.totalSharedInCents).toBe(total);
    expect(
      s.members.reduce((a: number, m: { quotaInCents: number }) => a + m.quotaInCents, 0),
    ).toBe(total);
    expect(
      s.members.reduce((a: number, m: { differenceInCents: number }) => a + m.differenceInCents, 0),
    ).toBe(0);
    const ext = await at(DEC, () => call(mariana(), "GET", "/api/v1/transactions?period=2026-12"));
    expect(ext.body.totals.expenseInCents).toBe(total);
    const res = await at(DEC, () => call(mariana(), "GET", "/api/v1/month-summary?period=2026-12"));
    expect(res.body.expenseInCents).toBe(total);
  });

  it("concorrência: leituras e alternâncias em Promise.all não duplicam nem corrompem o rateio", async () => {
    const sub = await create({ isSharedExpense: true, amountInCents: 5591 });
    await at(DEC, () =>
      Promise.all([
        ...Array.from({ length: 5 }, () => call(mariana(), "GET", "/api/v1/transactions")),
        ...Array.from({ length: 3 }, () => call(lucas(), "GET", "/api/v1/subscriptions")),
      ]),
    );
    const rows = await charges(sub.id);
    expect(rows).toHaveLength(1);
    expect(await db.transaction.count({ where: { origin: "SUBSCRIPTION" } })).toBe(1);
    const parts = rows[0]?.transaction?.splits.map((x) => Number(x.amountInCents)) ?? [];
    expect(parts.reduce((a, b) => a + b, 0)).toBe(5591);
    const race = await Promise.all([
      patch(sub.id, { version: 1, isSharedExpense: false }),
      patch(sub.id, { version: 1, isSharedExpense: false, description: "Outra" }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await settle(DEC, "2026-12")).body.totalSharedInCents).toBe(5591);
  });

  it("isolamento: outra família não vê nem altera a assinatura dividida (404)", async () => {
    const sub = await create({ isSharedExpense: true });
    const other = await makeFamily({
      name: "Outra",
      uniqueEmails: true,
      members: [{ email: "x@x.com", name: "Zeca Souza", role: "ADMIN" }],
    });
    const res = await patch(
      sub.id,
      { version: 1, isSharedExpense: false },
      other.byName.Zeca?.as ?? null,
    );
    expect(res.status).toBe(404);
  });
});
