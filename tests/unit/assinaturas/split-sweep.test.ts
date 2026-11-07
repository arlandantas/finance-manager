import { describe, expect, it } from "vitest";
import { splitAmount } from "@/modules/split/split-amount";
import { mulberry32 } from "../../support/prng";

// US-099: varredura de propriedade — a cota de uma cobrança de assinatura soma exatamente o valor.
describe("assinatura dividida: Σ partes = valor (centavos inteiros)", () => {
  const rnd = mulberry32(2026);
  const amounts = [
    1,
    2,
    3,
    99,
    5591,
    10000,
    9_999_999_999,
    ...Array.from({ length: 200 }, () => 1 + Math.floor(rnd() * 1e8)),
  ];
  it("EQUAL com 2..6 membros e proporcional aleatório, pagador qualquer", () => {
    for (const amount of amounts) {
      for (let n = 2; n <= 6; n++) {
        const equal = Array.from({ length: n }, (_, i) => ({
          memberId: `m${i}`,
          bps: Math.floor(10000 / n),
          ordinal: i,
          weight: 1,
        }));
        const cuts = Array.from({ length: n - 1 }, () => Math.floor(rnd() * 10000)).sort(
          (a, b) => a - b,
        );
        const bounds = [0, ...cuts, 10000];
        const prop = Array.from({ length: n }, (_, i) => ({
          memberId: `m${i}`,
          bps: (bounds[i + 1] as number) - (bounds[i] as number),
          ordinal: i,
        }));
        for (const shares of [equal, prop]) {
          const payerMemberId = `m${Math.floor(rnd() * n)}`;
          const out = splitAmount({ amountInCents: amount, shares, payerMemberId });
          const values = Object.values(out);
          expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
          expect(values.reduce((a, b) => a + b, 0)).toBe(amount);
          for (const s of shares) if (s.bps === 0) expect(out[s.memberId]).toBe(0);
        }
      }
    }
  });
});
