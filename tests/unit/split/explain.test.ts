import { describe, expect, it } from "vitest";
import { periodFromKey } from "@/lib/period";
import { explainByRules, formatPermille, formatSplitLabel } from "@/modules/split/explain";
import type { RuleInput } from "@/modules/split/rules";
import { computeSettlement, type ExpenseInput, type MemberInput } from "@/modules/split/settlement";

const M = "mariana";
const L = "lucas";
const members: MemberInput[] = [
  { id: M, ordinal: 1, joinedOn: "2026-01-01" },
  { id: L, ordinal: 2, joinedOn: "2026-01-01" },
];
const equal: RuleInput = {
  id: "r0",
  kind: "EQUAL",
  effectiveFrom: "1970-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  shares: [],
};
const prop = (
  id: string,
  from: string,
  m: number,
  l: number,
  createdAt = "2026-10-04T00:00:00Z",
): RuleInput => ({
  id,
  kind: "PROPORTIONAL",
  effectiveFrom: from,
  createdAt,
  shares: [
    { memberId: M, bps: m },
    { memberId: L, bps: l },
  ],
});
const exp = (id: string, payer: string, cents: number, on: string): ExpenseInput => ({
  id,
  amountInCents: cents,
  payerMemberId: payer,
  occurredOn: on,
});

function explain(
  key: string,
  today: string,
  rules: RuleInput[],
  expenses: ExpenseInput[],
  ms = members,
) {
  const period = periodFromKey(key);
  const result = computeSettlement({ period, members: ms, expenses, rules, settlements: [] });
  const e = explainByRules({ period, today, rules, members: ms, expenses, result });
  return {
    e,
    result,
    label: e
      ? formatSplitLabel(
          e,
          ms.map((m) => m.id),
        )
      : null,
  };
}

describe("US-022 explainByRules / formatSplitLabel (SDD-011 §4.1)", () => {
  const rules = [equal, prop("r1", "2026-10-04", 5800, 4200)];
  const out = [exp("a", M, 40000, "2026-10-02"), exp("b", L, 100000, "2026-10-10")];

  it("X1: mês com mudança de regra mostra dois trechos e o ponderado das cotas", () => {
    const { e, result, label } = explain("2026-10", "2026-10-12", rules, out);
    expect(result.members.map((m) => m.quotaInCents)).toEqual([78000, 62000]);
    expect(e?.segments.map((s) => [s.from, s.to])).toEqual([
      [null, "2026-10-03"],
      ["2026-10-04", null],
    ]);
    expect(e?.weighted?.shares.map((s) => s.permille)).toEqual([557, 443]);
    expect(e?.showWeighted).toBe(true);
    expect(label?.label).toBe("50% / 50% até 03/10 · 58% / 42% a partir de 04/10");
    expect(label?.weightedLine).toBe("Na prática neste mês: 55,7% / 44,3%");
  });

  it("X2: mês passado não herda a regra criada depois", () => {
    const { e, label } = explain("2026-09", "2026-10-12", rules, [
      exp("a", M, 71700, "2026-09-10"),
    ]);
    expect(e?.segments).toHaveLength(1);
    expect(label?.label).toBe("Divisão igual (50% / 50%)");
    expect(label?.label).not.toContain("58");
  });

  it("X3: só a versão inicial => 'Divisão igual (padrão)' e sem ponderado", () => {
    const { e, label } = explain(
      "2026-09",
      "2026-10-12",
      [equal],
      [exp("a", M, 71700, "2026-09-10")],
    );
    expect(label?.label).toBe("Divisão igual (padrão)");
    expect(e?.showWeighted).toBe(false);
    expect(label?.weightedLine).toBeNull();
  });

  it("X4: três membros iguais => 33,34% / 33,33% / 33,33%", () => {
    const three = [...members, { id: "joao", ordinal: 3, joinedOn: "2026-01-01" }];
    const r = [{ ...equal, effectiveFrom: "2026-01-01" }];
    const { label } = explain(
      "2026-10",
      "2026-10-12",
      r,
      [exp("a", M, 10000, "2026-10-02")],
      three,
    );
    expect(label?.label).toBe("Divisão igual (33,34% / 33,33% / 33,33%)");
  });

  it("X5: regra com vigência no fim do mês, sem despesas depois, ainda mostra os dois trechos", () => {
    const r = [equal, prop("r1", "2026-10-25", 5800, 4200)];
    const { e, label } = explain("2026-10", "2026-10-28", r, [exp("a", M, 10000, "2026-10-02")]);
    expect(e?.segments.map((s) => s.expensesCount)).toEqual([1, 0]);
    expect(label?.label).toBe("50% / 50% até 24/10 · 58% / 42% a partir de 25/10");
  });

  it("vigência futura (depois de hoje) não aparece", () => {
    const r = [equal, prop("r1", "2026-10-25", 5800, 4200)];
    const { e } = explain("2026-10", "2026-10-12", r, [exp("a", M, 10000, "2026-10-02")]);
    expect(e?.segments).toHaveLength(1);
  });

  it("X6: sem despesas comuns => explicação nula", () => {
    expect(explain("2026-11", "2026-11-10", [equal], []).e).toBeNull();
  });

  it("X7: duas regras na mesma data => vale a de createdAt maior (um só trecho novo)", () => {
    const r = [
      equal,
      prop("r1", "2026-10-04", 5800, 4200, "2026-10-04T10:00:00Z"),
      prop("r2", "2026-10-04", 7000, 3000, "2026-10-04T11:00:00Z"),
    ];
    const { e, label } = explain("2026-10", "2026-10-12", r, out);
    expect(e?.segments).toHaveLength(2);
    expect(e?.segments[1]?.ruleVersionId).toBe("r2");
    expect(label?.label).toContain("70% / 30% a partir de 04/10");
  });

  it("X8 + formatPermille: apportion(1000) soma exata e uma casa decimal", () => {
    const { e } = explain("2026-10", "2026-10-12", rules, out);
    expect(e?.weighted?.shares.reduce((s, x) => s + x.permille, 0)).toBe(1000);
    expect(formatPermille(557)).toBe("55,7");
    expect(formatPermille(1000)).toBe("100,0");
    expect(formatPermille(5)).toBe("0,5");
  });

  it("três trechos usam 'de dd/MM a dd/MM' no intermediário", () => {
    const r = [equal, prop("r1", "2026-10-04", 5800, 4200), prop("r2", "2026-10-20", 7000, 3000)];
    const { label } = explain("2026-10", "2026-10-28", r, out);
    expect(label?.label).toBe(
      "50% / 50% até 03/10 · 58% / 42% de 04/10 a 19/10 · 70% / 30% a partir de 20/10",
    );
  });

  it("dados homologados: outubro 3.169,90 a 50/50 => cota 1.584,95 e rótulo igual", () => {
    const { e, result, label } = explain(
      "2026-10",
      "2026-10-04",
      [equal],
      [exp("a", M, 316990, "2026-10-02")],
    );
    expect(result.members.map((m) => m.quotaInCents)).toEqual([158495, 158495]);
    expect(label?.label).toBe("Divisão igual (padrão)");
    expect(e?.showWeighted).toBe(false);
  });
});
