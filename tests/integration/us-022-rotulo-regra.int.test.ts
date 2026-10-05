import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
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
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(now: string, fn: () => Promise<T>) => withClock(now, fn);

const spend = (payer: "Mariana" | "Lucas", amountInCents: number, occurredOn: string) =>
  makeTransaction(fx, {
    account: nubank,
    category: "Supermercado",
    amountInCents,
    occurredOn,
    author: payer,
    payer,
    shared: true,
  });

async function proportional(from: string, bps: { Mariana: number; Lucas: number }) {
  await db.splitRuleVersion.create({
    data: {
      familyId: fx.family.id,
      kind: "PROPORTIONAL",
      effectiveFrom: new Date(`${from}T00:00:00Z`),
      shares: {
        create: [
          { memberId: fx.byName.Mariana?.memberId as string, bps: bps.Mariana },
          { memberId: fx.byName.Lucas?.memberId as string, bps: bps.Lucas },
        ],
      },
    },
  });
}

const settle = (now: string, qs = "") =>
  at(now, () => call(lucas(), "GET", `/api/v1/settlement${qs}`));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
});

describe("US-022 rótulo honesto da regra (SettlementDTO.splitExplanation)", () => {
  it("mês com regra única: padrão, sem ponderado; cotas inalteradas (setembro 717,00 / 358,50)", async () => {
    await spend("Mariana", 71700, "2026-09-10");
    const res = await settle("2026-10-12T15:00:00Z", "?period=2026-09");
    expect(res.status).toBe(200);
    expect(res.body.totalSharedInCents).toBe(71700);
    expect(res.body.members.map((m: { quotaInCents: number }) => m.quotaInCents).sort()).toEqual([
      35850, 35850,
    ]);
    expect(res.body.splitExplanation.segments).toHaveLength(1);
    expect(res.body.splitExplanation.segments[0]).toMatchObject({ kind: "EQUAL", isDefault: true });
    expect(res.body.splitExplanation.showWeighted).toBe(false);
  });

  it("mês passado não herda a regra criada depois (X2)", async () => {
    await db.splitRuleVersion.create({
      data: {
        familyId: fx.family.id,
        kind: "EQUAL",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await proportional("2026-10-04", { Mariana: 5800, Lucas: 4200 });
    await spend("Mariana", 71700, "2026-09-10");
    const res = await settle("2026-10-12T15:00:00Z", "?period=2026-09");
    expect(res.body.splitExplanation.segments).toHaveLength(1);
    expect(res.body.splitExplanation.segments[0].kind).toBe("EQUAL");
    expect(res.body.splitExplanation.segments[0].isDefault).toBe(false);
  });

  it("X1: dois trechos, cotas 780,00 / 620,00 e ponderado 55,7 / 44,3 da mesma fonte das cotas", async () => {
    await proportional("2026-10-04", { Mariana: 5800, Lucas: 4200 });
    await spend("Mariana", 40000, "2026-10-02");
    await spend("Lucas", 100000, "2026-10-10");
    const res = await settle("2026-10-12T15:00:00Z");
    const e = res.body.splitExplanation;
    expect(
      e.segments.map((s: { from: string | null; to: string | null }) => [s.from, s.to]),
    ).toEqual([
      [null, "2026-10-03"],
      ["2026-10-04", null],
    ]);
    const quota = (n: string) =>
      res.body.members.find((m: { member: { name: string } }) => m.member.name.startsWith(n))
        .quotaInCents;
    expect([quota("Mariana"), quota("Lucas")]).toEqual([78000, 62000]);
    expect(quota("Mariana") + quota("Lucas")).toBe(res.body.totalSharedInCents);
    expect(e.weighted.shares.map((s: { permille: number }) => s.permille)).toEqual([557, 443]);
    expect(e.showWeighted).toBe(true);
  });

  it("mês sem despesas comuns => splitExplanation nulo", async () => {
    const res = await settle("2026-11-10T15:00:00Z", "?period=2026-11");
    expect(res.body.splitExplanation).toBeNull();
  });

  it("homologado: outubro 3.169,90 a 50/50 => cota 1.584,95 e 'padrão'", async () => {
    await spend("Mariana", 316990, "2026-10-02");
    const res = await settle("2026-10-04T15:00:00Z");
    expect(res.body.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      158495, 158495,
    ]);
    expect(res.body.splitExplanation.showWeighted).toBe(false);
  });

  it("GET /split-rule/history: todos os membros veem, mais recente primeiro", async () => {
    await proportional("2026-10-04", { Mariana: 5800, Lucas: 4200 });
    const res = await at("2026-10-12T15:00:00Z", () =>
      call(lucas(), "GET", "/api/v1/split-rule/history"),
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual(["PROPORTIONAL", "EQUAL"]);
    expect(res.body.items[0].shares.map((s: { bps: number }) => s.bps).sort()).toEqual([
      4200, 5800,
    ]);
  });

  it("history exige sessão", async () => {
    const res = await call(null, "GET", "/api/v1/split-rule/history");
    expect(res.status).toBe(401);
  });
});
