import { describe, expect, it } from "vitest";
import {
  equalShares,
  formatBps,
  formatBpsList,
  isRuleStale,
  parsePercentToBps,
  type RuleInput,
  ruleAt,
} from "@/modules/split/rules";

const rule = (
  id: string,
  effectiveFrom: string,
  createdAt = "2026-01-01T00:00:00Z",
): RuleInput => ({
  id,
  kind: "EQUAL",
  effectiveFrom,
  createdAt,
  shares: [],
});

describe("US-008 ruleAt (SDD-002 §4.2)", () => {
  it("troca de regra no meio do mês: cada data usa a vigente", () => {
    const rules = [rule("a", "1970-01-01"), rule("b", "2026-10-15")];
    expect(ruleAt(rules, "2026-10-14").id).toBe("a");
    expect(ruleAt(rules, "2026-10-15").id).toBe("b");
    expect(ruleAt(rules, "2026-10-31").id).toBe("b");
  });

  it("mesma effectiveFrom: desempata pelo createdAt mais recente", () => {
    const rules = [
      rule("a", "2026-10-01", "2026-10-01T10:00:00Z"),
      rule("b", "2026-10-01", "2026-10-01T11:00:00Z"),
    ];
    expect(ruleAt(rules, "2026-10-20").id).toBe("b");
    expect(ruleAt([...rules].reverse(), "2026-10-20").id).toBe("b");
  });

  it("regra futura não vale hoje; a de 1970 sempre existe", () => {
    const rules = [rule("a", "1970-01-01"), rule("b", "2027-01-01")];
    expect(ruleAt(rules, "2026-10-04").id).toBe("a");
  });

  it("sem nenhuma regra aplicável lança RangeError", () => {
    expect(() => ruleAt([rule("b", "2027-01-01")], "2026-10-04")).toThrow(RangeError);
  });
});

describe("US-008 parsePercentToBps (SDD-002 §8)", () => {
  it("valores válidos", () => {
    expect(parsePercentToBps("60")).toBe(6000);
    expect(parsePercentToBps("33,33")).toBe(3333);
    expect(parsePercentToBps("33.3")).toBe(3330);
    expect(parsePercentToBps("100")).toBe(10000);
    expect(parsePercentToBps("0")).toBe(0);
    expect(parsePercentToBps("60%")).toBe(6000);
  });
  it("inválidos: 110, -10, abc, vazio, 3 casas", () => {
    expect(parsePercentToBps("110")).toBeNull();
    expect(parsePercentToBps("-10")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("10,123")).toBeNull();
    expect(parsePercentToBps("100,01")).toBeNull();
  });
});

describe("US-008 formatação de percentuais", () => {
  it("formatBps e lista", () => {
    expect(formatBps(5000)).toBe("50");
    expect(formatBps(3334)).toBe("33,34");
    expect(formatBps(3330)).toBe("33,3");
    expect(formatBps(0)).toBe("0");
    expect(formatBpsList([{ bps: 3334 }, { bps: 3333 }, { bps: 3333 }])).toBe(
      "33,34% / 33,33% / 33,33%",
    );
  });
  it("equalShares usa o maior resto na ordem canônica", () => {
    expect(
      equalShares([
        { id: "c", ordinal: 2 },
        { id: "a", ordinal: 0 },
        { id: "b", ordinal: 1 },
      ]),
    ).toEqual([
      { memberId: "a", bps: 3334 },
      { memberId: "b", bps: 3333 },
      { memberId: "c", bps: 3333 },
    ]);
    expect(equalShares([])).toEqual([]);
  });
});

describe("US-008 isRuleStale", () => {
  it("PROPORTIONAL que não cobre todos os membros fica desatualizada", () => {
    const current = {
      kind: "PROPORTIONAL" as const,
      shares: [
        { memberId: "m", bps: 6000 },
        { memberId: "l", bps: 4000 },
      ],
    };
    expect(isRuleStale(current, ["m", "l"])).toBe(false);
    expect(isRuleStale(current, ["m", "l", "x"])).toBe(true);
    expect(isRuleStale({ kind: "EQUAL", shares: [] }, ["m", "l", "x"])).toBe(false);
  });
});
