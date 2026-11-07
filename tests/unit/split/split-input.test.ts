import { describe, expect, it } from "vitest";
import { splitAmount } from "@/modules/split/split-amount";
import { SPLIT_SUM_MSG, SplitInputSchema, splitOf } from "@/modules/split/split-input";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("SplitInputSchema (US-043)", () => {
  it("aceita NONE, RULE e CUSTOM com 0% e 100%", () => {
    expect(SplitInputSchema.safeParse({ mode: "NONE" }).success).toBe(true);
    expect(SplitInputSchema.safeParse({ mode: "RULE" }).success).toBe(true);
    expect(
      SplitInputSchema.safeParse({
        mode: "CUSTOM",
        shares: [
          { memberId: A, bps: 10000 },
          { memberId: B, bps: 0 },
        ],
      }).success,
    ).toBe(true);
  });

  it("recusa soma diferente de 100%, membro repetido e menos de dois membros", () => {
    const sum = SplitInputSchema.safeParse({
      mode: "CUSTOM",
      shares: [
        { memberId: A, bps: 6000 },
        { memberId: B, bps: 3000 },
      ],
    });
    expect(sum.success).toBe(false);
    expect(JSON.stringify(sum.error?.issues)).toContain(SPLIT_SUM_MSG);
    expect(
      SplitInputSchema.safeParse({
        mode: "CUSTOM",
        shares: [
          { memberId: A, bps: 5000 },
          { memberId: A, bps: 5000 },
        ],
      }).success,
    ).toBe(false);
    expect(
      SplitInputSchema.safeParse({ mode: "CUSTOM", shares: [{ memberId: A, bps: 10000 }] }).success,
    ).toBe(false);
  });

  it("splitOf: split vence; isSharedExpense true == RULE; ausente == NONE", () => {
    expect(splitOf({ split: { mode: "NONE" }, isSharedExpense: undefined })).toEqual({
      mode: "NONE",
    });
    expect(splitOf({ isSharedExpense: true })).toEqual({ mode: "RULE" });
    expect(splitOf({})).toEqual({ mode: "NONE" });
  });
});

describe("splitAmount: vetores da US-043", () => {
  const sh = (l: Array<[string, number]>) =>
    l.map(([memberId, bps], ordinal) => ({ memberId, bps, ordinal }));
  it("5 centavos 50/50 pagador A = 3/2", () => {
    expect(
      splitAmount({
        amountInCents: 5,
        shares: sh([
          [A, 5000],
          [B, 5000],
        ]),
        payerMemberId: A,
      }),
    ).toEqual({ [A]: 3, [B]: 2 });
  });
  it("9000 40/40/20 = 3600/3600/1800", () => {
    expect(
      splitAmount({
        amountInCents: 9000,
        shares: sh([
          [A, 4000],
          [B, 4000],
          [C, 2000],
        ]),
        payerMemberId: A,
      }),
    ).toEqual({ [A]: 3600, [B]: 3600, [C]: 1800 });
  });
  it("20000 100%/0% = 20000/0", () => {
    expect(
      splitAmount({
        amountInCents: 20000,
        shares: sh([
          [A, 10000],
          [B, 0],
        ]),
        payerMemberId: B,
      }),
    ).toEqual({ [A]: 20000, [B]: 0 });
  });
  it("10001 50/50 pagadora B = 5001/5000 e a ordem das shares é irrelevante", () => {
    const shares = sh([
      [A, 5000],
      [B, 5000],
    ]);
    const want = { [A]: 5000, [B]: 5001 };
    expect(splitAmount({ amountInCents: 10001, shares, payerMemberId: B })).toEqual(want);
    expect(
      splitAmount({ amountInCents: 10001, shares: [...shares].reverse(), payerMemberId: B }),
    ).toEqual(want);
  });
  it("propriedade: Σ = total para totais e percentuais variados", () => {
    for (let amount = 1; amount < 300; amount += 7) {
      for (const [x, y] of [
        [3333, 6667],
        [1, 9999],
        [5000, 5000],
        [9999, 1],
      ] as const) {
        const out = splitAmount({
          amountInCents: amount,
          shares: sh([
            [A, x],
            [B, y],
          ]),
          payerMemberId: A,
        });
        expect((out[A] as number) + (out[B] as number)).toBe(amount);
      }
    }
  });
});
