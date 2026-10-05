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
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const shares = (m: number, l: number) => [
  { memberId: fx.byName.Mariana?.memberId, bps: m },
  { memberId: fx.byName.Lucas?.memberId, bps: l },
];
const preview = (as: ReturnType<typeof mariana>, body: Record<string, unknown>) =>
  at(() => call(as, "POST", "/api/v1/split-rule/preview", body));
const spend = (cents: number, on: string) =>
  makeTransaction(fx, {
    account: acc,
    category: "Supermercado",
    amountInCents: cents,
    occurredOn: on,
    author: "Lucas",
    payer: "Lucas",
    shared: true,
  });

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "N", owner: "Mariana", openingBalanceInCents: 0 });
});

describe("US-031 POST /split-rule/preview", () => {
  it("P1/P2: impacto 0 e 4000; nada é gravado", async () => {
    await spend(100000, "2026-10-10");
    const body = { kind: "PROPORTIONAL", shares: shares(5800, 4200) };
    const rulesBefore = await db.splitRuleVersion.count();
    expect((await preview(mariana(), body)).body.impactInCents).toBe(0);
    await spend(50000, "2026-10-12");
    const r = await preview(mariana(), body);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      impactInCents: 4000,
      affectedExpensesCount: 1,
      effectiveFrom: "2026-10-12",
      period: { key: "2026-10" },
    });
    expect(await db.splitRuleVersion.count()).toBe(rulesBefore);
  });
  it("P3: soma != 100% => 400; P4: vigência antes do período => 422", async () => {
    const bad = await preview(mariana(), { kind: "PROPORTIONAL", shares: shares(6000, 5000) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe("Os percentuais precisam somar 100%");
    const past = await preview(mariana(), { kind: "EQUAL", effectiveFrom: "2026-09-30" });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe("EFFECTIVE_FROM_IN_PAST");
  });
  it("Membro => 403; acerto desligado => 409", async () => {
    expect((await preview(lucas(), { kind: "EQUAL" })).status).toBe(403);
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    expect((await preview(mariana(), { kind: "EQUAL" })).status).toBe(409);
  });
});
