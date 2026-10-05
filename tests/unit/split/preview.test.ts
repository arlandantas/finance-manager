import { describe, expect, it } from "vitest";
import { periodFromKey } from "@/lib/period";
import { computeRulePreview, suggestBpsFromIncomes } from "@/modules/split/preview";
import type { RuleInput } from "@/modules/split/rules";
import type { ExpenseInput, MemberInput } from "@/modules/split/settlement";

const M = "mariana";
const L = "lucas";
const members: MemberInput[] = [
  { id: M, ordinal: 0, joinedOn: "2026-01-01" },
  { id: L, ordinal: 1, joinedOn: "2026-01-01" },
];
const equal: RuleInput = {
  id: "r0",
  kind: "EQUAL",
  effectiveFrom: "1970-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  shares: [],
};
const exp = (id: string, cents: number, on: string): ExpenseInput => ({
  id,
  amountInCents: cents,
  payerMemberId: L,
  occurredOn: on,
});
const c5842 = {
  kind: "PROPORTIONAL" as const,
  shares: [
    { memberId: M, bps: 5800 },
    { memberId: L, bps: 4200 },
  ],
};
const run = (expenses: ExpenseInput[]) =>
  computeRulePreview({
    period: periodFromKey("2026-10"),
    members,
    expenses,
    rules: [equal],
    settlements: [],
    candidate: c5842,
    effectiveFrom: "2026-10-12",
    nowIso: "2026-10-12T15:00:00Z",
    currentShares: [
      { memberId: M, bps: 5000 },
      { memberId: L, bps: 5000 },
    ],
    nextShares: c5842.shares,
  });

describe("US-031 prévia da regra (SDD-011 P1..P2)", () => {
  it("P1: só despesa anterior à vigência => impacto 0", () => {
    const p = run([exp("a", 100000, "2026-10-10")]);
    expect(p.impactInCents).toBe(0);
    expect(p.affectedExpensesCount).toBe(0);
  });
  it("P2: + 50000 em 12/10 => impacto 4000 e 1 despesa afetada; quitar a diferença", () => {
    const p = run([exp("a", 100000, "2026-10-10"), exp("b", 50000, "2026-10-12")]);
    expect(p.impactInCents).toBe(4000);
    expect(p.affectedExpensesCount).toBe(1);
    expect(p.currentToSettleInCents).toBe(75000);
    expect(p.nextToSettleInCents).toBe(79000);
  });
  it("não muta as entradas", () => {
    const rules = [equal];
    const before = JSON.stringify(rules);
    run([exp("a", 1000, "2026-10-12")]);
    expect(JSON.stringify(rules)).toBe(before);
  });
});

describe("US-031 suggestBpsFromIncomes (R1..R3)", () => {
  it("R1: 6.500,00 e 4.800,00 => 58% / 42%", () => {
    expect(
      suggestBpsFromIncomes([
        { memberId: M, ordinal: 0, incomeInCents: 650000 },
        { memberId: L, ordinal: 1, incomeInCents: 480000 },
      ]),
    ).toEqual([
      { memberId: M, bps: 5800 },
      { memberId: L, bps: 4200 },
    ]);
  });
  it("R2: rendas zeradas => RangeError (UI pede 'Informe as rendas')", () => {
    expect(() =>
      suggestBpsFromIncomes([
        { memberId: M, ordinal: 0, incomeInCents: 0 },
        { memberId: L, ordinal: 1, incomeInCents: 0 },
      ]),
    ).toThrow(RangeError);
  });
  it("R3: rendas iguais com 3 membros => 34/33/33 e soma 100", () => {
    const r = suggestBpsFromIncomes(
      ["a", "b", "c"].map((id, i) => ({ memberId: id, ordinal: i, incomeInCents: 100000 })),
    );
    expect(r.map((x) => x.bps)).toEqual([3400, 3300, 3300]);
  });
});
