import { describe, expect, it } from "vitest";
import { periodFromKey } from "@/lib/period";
import {
  computeSettlementFor,
  type MemberInput,
  SplitInconsistentError,
} from "@/modules/split/settlement";

const period = periodFromKey("2026-10");
const M: MemberInput = { id: "m", ordinal: 0, joinedOn: "2026-01-01" };
const L: MemberInput = { id: "l", ordinal: 1, joinedOn: "2026-01-01" };
const e = (id: string, amount: number, splits: Array<[string, number]>, payer = "m") => ({
  id,
  amountInCents: amount,
  payerMemberId: payer,
  occurredOn: "2026-10-10",
  splits: splits.map(([memberId, amountInCents]) => ({ memberId, amountInCents })),
});

describe("computeSettlementStored (EN-002a)", () => {
  it("cota = Σ do rateio gravado; reembolso 0/100 funciona (US-043, V3)", () => {
    const r = computeSettlementFor("STORED", {
      period,
      members: [M, L],
      settlements: [],
      expenses: [
        e(
          "1",
          20000,
          [
            ["l", 20000],
            ["m", 0],
          ],
          "m",
        ),
      ],
    });
    expect(r.members.map((m) => m.quotaInCents)).toEqual([0, 20000]);
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 20000 }]);
  });
  it("despesa comum sem rateio lança SplitInconsistentError (nunca soma silenciosamente errada)", () => {
    expect(() =>
      computeSettlementFor("STORED", {
        period,
        members: [M, L],
        settlements: [],
        expenses: [e("x", 100, [])],
      }),
    ).toThrow(SplitInconsistentError);
  });
  it("Σ do rateio ≠ valor lança SplitInconsistentError com o motivo", () => {
    try {
      computeSettlementFor("STORED", {
        period,
        members: [M, L],
        settlements: [],
        expenses: [
          e("x", 100, [
            ["m", 50],
            ["l", 49],
          ]),
        ],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SplitInconsistentError);
      expect((err as SplitInconsistentError).reason).toContain("99");
    }
  });
  it("membro que só aparece no rateio (ex-membro) entra e a Σ das cotas fecha", () => {
    const X: MemberInput = { id: "x", ordinal: 2, joinedOn: "2026-01-01", removedOn: "2026-09-01" };
    const r = computeSettlementFor("STORED", {
      period,
      members: [M, L, X],
      settlements: [],
      expenses: [
        e("1", 300, [
          ["m", 100],
          ["l", 100],
          ["x", 100],
        ]),
      ],
    });
    expect(r.members.reduce((s, m) => s + m.quotaInCents, 0)).toBe(300);
    expect(r.members.map((m) => m.memberId)).toEqual(["m", "l", "x"]);
  });
  it("sem despesas => EMPTY; 1 membro => NEEDS_MORE_MEMBERS", () => {
    expect(
      computeSettlementFor("STORED", { period, members: [M, L], settlements: [], expenses: [] })
        .status,
    ).toBe("EMPTY");
    expect(
      computeSettlementFor("STORED", {
        period,
        members: [M],
        settlements: [],
        expenses: [e("1", 10, [["m", 10]])],
      }).status,
    ).toBe("NEEDS_MORE_MEMBERS");
  });
});
