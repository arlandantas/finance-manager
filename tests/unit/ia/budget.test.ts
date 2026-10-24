import { describe, expect, it } from "vitest";
import { decideBudget } from "@/modules/ia/budget";
import {
  centsToMicro,
  costMicroBrl,
  DEFAULT_PRICES,
  estimateInputTokens,
} from "@/modules/ia/pricing";
import { mulberry32 } from "../../support/prng";

describe("EN-004 decideBudget", () => {
  const base = { reservedMicro: 0n, estimateMicro: 1000n, capCents: 500 };
  it("gasto >= teto bloqueia", () => {
    expect(decideBudget({ ...base, spentMicro: centsToMicro(500) })).toBe("exceeded");
    expect(decideBudget({ ...base, capCents: 0, spentMicro: 0n })).toBe("exceeded");
  });
  it("gasto + reservas + estimativa acima do teto bloqueia a estimativa", () => {
    expect(decideBudget({ ...base, spentMicro: centsToMicro(500) - 500n })).toBe(
      "estimate_exceeds",
    );
    expect(decideBudget({ ...base, spentMicro: 0n, reservedMicro: centsToMicro(500) - 999n })).toBe(
      "estimate_exceeds",
    );
  });
  it("exatamente no teto passa", () => {
    expect(decideBudget({ ...base, spentMicro: centsToMicro(500) - 1000n })).toBe("ok");
  });
});

describe("EN-004 custo real nunca passa da reserva", () => {
  const price = DEFAULT_PRICES["claude-haiku-5-5"] as (typeof DEFAULT_PRICES)[string];
  it("propriedade (>= 1000 casos)", () => {
    const rnd = mulberry32(2026);
    const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
    for (let i = 0; i < 1500; i++) {
      const sys = int(0, 20000);
      const bytes = int(0, 32768);
      const maxOut = int(256, 8000);
      const estIn = estimateInputTokens(sys, bytes);
      const reserved = costMicroBrl({ inputTokens: estIn, outputTokens: maxOut }, price, 6);
      // entrada real <= estimada; saída real <= max_tokens
      const real = costMicroBrl(
        { inputTokens: Math.floor(estIn * rnd()), outputTokens: Math.floor(maxOut * rnd()) },
        price,
        6,
      );
      expect(real <= reserved).toBe(true);
    }
  });
});
