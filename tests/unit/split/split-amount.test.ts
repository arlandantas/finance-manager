import { describe, expect, it } from "vitest";
import { periodFromKey } from "@/lib/period";
import type { RuleInput } from "@/modules/split/rules";
import { resolveRuleShares, type ShareInput, splitAmount } from "@/modules/split/split-amount";
import { mulberry32 } from "../../support/prng";

const sh = (...v: Array<[string, number]>): ShareInput[] =>
  v.map(([memberId, bps], ordinal) => ({ memberId, bps, ordinal }));

describe("splitAmount: vetores V1..V10 (SDD-015 §4.1)", () => {
  it("V1: 5 centavos 50/50 pago por Lucas => Lucas 3, Mariana 2", () => {
    expect(
      splitAmount({ amountInCents: 5, shares: sh(["M", 5000], ["L", 5000]), payerMemberId: "L" }),
    ).toEqual({ M: 2, L: 3 });
  });
  it("V2: 9000 em 40/40/20", () => {
    expect(
      splitAmount({
        amountInCents: 9000,
        shares: sh(["A", 4000], ["B", 4000], ["C", 2000]),
        payerMemberId: "A",
      }),
    ).toEqual({ A: 3600, B: 3600, C: 1800 });
  });
  it("V3: reembolso 100/0, pagadora Mariana", () => {
    expect(
      splitAmount({ amountInCents: 20000, shares: sh(["L", 10000], ["M", 0]), payerMemberId: "M" }),
    ).toEqual({ L: 20000, M: 0 });
  });
  it("V4: 100 em 3333/3333/3334, pagador é um dos 3333 => pagador 34", () => {
    expect(
      splitAmount({
        amountInCents: 100,
        shares: sh(["A", 3333], ["B", 3333], ["C", 3334]),
        payerMemberId: "A",
      }),
    ).toEqual({ A: 34, B: 33, C: 33 });
  });
  it("V5: 101, pagador fora do rateio => maiores restos C e A (ordinal)", () => {
    expect(
      splitAmount({
        amountInCents: 101,
        shares: sh(["A", 3333], ["B", 3333], ["C", 3334]),
        payerMemberId: "Z",
      }),
    ).toEqual({ A: 34, B: 33, C: 34 });
  });
  it("V6: 100 em 3334/3333/3333, pagador o 2º", () => {
    expect(
      splitAmount({
        amountInCents: 100,
        shares: sh(["A", 3334], ["B", 3333], ["C", 3333]),
        payerMemberId: "B",
      }),
    ).toEqual({ A: 33, B: 34, C: 33 });
  });
  it("V7: 1 centavo 50/50 pago por Lucas", () => {
    expect(
      splitAmount({ amountInCents: 1, shares: sh(["M", 5000], ["L", 5000]), payerMemberId: "L" }),
    ).toEqual({ M: 0, L: 1 });
  });
  it("V8: 7 centavos, Mariana 100% e Lucas 0% (pagador Lucas, bps 0) => tudo Mariana", () => {
    expect(
      splitAmount({ amountInCents: 7, shares: sh(["M", 10000], ["L", 0]), payerMemberId: "L" }),
    ).toEqual({ M: 7, L: 0 });
  });
  it("V9: 100 com 5000/5000/0, pagador o de 0% => sobra 0", () => {
    expect(
      splitAmount({
        amountInCents: 100,
        shares: sh(["A", 5000], ["B", 5000], ["C", 0]),
        payerMemberId: "C",
      }),
    ).toEqual({ A: 50, B: 50, C: 0 });
  });
  it("V10: 10001 50/50 pago por Mariana => 5001 / 5000", () => {
    expect(
      splitAmount({
        amountInCents: 10001,
        shares: sh(["M", 5000], ["L", 5000]),
        payerMemberId: "M",
      }),
    ).toEqual({ M: 5001, L: 5000 });
  });
});

describe("splitAmount: propriedades (2000 casos, semente fixa)", () => {
  const rnd = mulberry32(15);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  it("Σ = valor, partes em [piso, piso + sobra], pagador com bps > 0 leva o piso + sobra, ordem irrelevante, determinismo", () => {
    for (let n = 0; n < 2000; n++) {
      const k = int(2, 4);
      const cuts = Array.from({ length: k - 1 }, () => int(0, 10000)).sort((a, b) => a - b);
      const bps = [
        cuts[0] as number,
        ...cuts.slice(1).map((c, i) => c - (cuts[i] as number)),
        10000 - (cuts[k - 2] as number),
      ];
      const shares: ShareInput[] = bps.map((b, ordinal) => ({
        memberId: `m${ordinal}`,
        bps: b,
        ordinal,
      }));
      const amount = int(1, 600000);
      const payer = rnd() < 0.8 ? `m${int(0, k - 1)}` : "fora";
      const r = splitAmount({ amountInCents: amount, shares, payerMemberId: payer });
      expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(amount);
      const positives = shares.filter((s) => s.bps > 0).length;
      for (const s of shares) {
        const floor = Math.floor((amount * s.bps) / 10000);
        const v = r[s.memberId] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeGreaterThanOrEqual(floor);
        expect(v).toBeLessThanOrEqual(floor + positives - 1 + (s.bps === 0 ? 1 : 0));
        if (s.bps === 0) expect(v).toBe(0);
      }
      const reversed = splitAmount({
        amountInCents: amount,
        shares: [...shares].reverse(),
        payerMemberId: payer,
      });
      expect(reversed).toEqual(r);
      expect(splitAmount({ amountInCents: amount, shares, payerMemberId: payer })).toEqual(r);
      const payerShare = shares.find((s) => s.memberId === payer);
      if (payerShare && payerShare.bps > 0) {
        const sobra =
          amount - shares.reduce((acc, s) => acc + Math.floor((amount * s.bps) / 10000), 0);
        expect(r[payer]).toBe(Math.floor((amount * payerShare.bps) / 10000) + sobra);
      }
    }
  });
});

describe("resolveRuleShares (Pela regra, SDD-015 §4.2)", () => {
  const period = periodFromKey("2026-10");
  const M = { id: "m", ordinal: 0, joinedOn: "2026-01-01" };
  const L = { id: "l", ordinal: 1, joinedOn: "2026-01-01" };
  const X = { id: "x", ordinal: 2, joinedOn: "2026-01-01" };
  const EQUAL: RuleInput = {
    id: "r0",
    kind: "EQUAL",
    effectiveFrom: "1970-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    shares: [],
  };
  it("EQUAL com 2 => 5000/5000; com 3 => 3334/3333/3333 por ordinal", () => {
    expect(resolveRuleShares({ rule: EQUAL, members: [M, L], period }).map((s) => s.bps)).toEqual([
      5000, 5000,
    ]);
    expect(
      resolveRuleShares({ rule: EQUAL, members: [M, L, X], period }).map((s) => s.bps),
    ).toEqual([3334, 3333, 3333]);
  });
  it("PROPORTIONAL 58/42 é a identidade; peso 0 não entra; ex-membro antes do período não entra", () => {
    const rule: RuleInput = {
      id: "r1",
      kind: "PROPORTIONAL",
      effectiveFrom: "2026-10-01",
      createdAt: "2026-10-01T00:00:00Z",
      shares: [
        { memberId: "m", bps: 5800 },
        { memberId: "l", bps: 4200 },
        { memberId: "x", bps: 0 },
      ],
    };
    expect(
      resolveRuleShares({ rule, members: [M, L, X], period }).map((s) => [s.memberId, s.bps]),
    ).toEqual([
      ["m", 5800],
      ["l", 4200],
    ]);
    expect(
      resolveRuleShares({
        rule: EQUAL,
        members: [M, L, { ...X, removedOn: "2026-09-10" }],
        period,
      }).map((s) => s.memberId),
    ).toEqual(["m", "l"]);
  });
});
