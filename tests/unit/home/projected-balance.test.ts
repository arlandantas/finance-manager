import { describe, expect, it } from "vitest";
import { projectedBalance } from "@/modules/previstas/rules";

describe("US-051 projectedBalance (SDD-017 §4.5)", () => {
  it("saldo 734950, a pagar 125890, a receber 500000 => 1109060", () => {
    expect(
      projectedBalance({ currentInCents: 734950, toPayInCents: 125890, toReceiveInCents: 500000 }),
    ).toBe(1109060);
  });
  it("sem a receber (null) => 609060, fórmula da R2.1", () => {
    expect(
      projectedBalance({ currentInCents: 734950, toPayInCents: 125890, toReceiveInCents: null }),
    ).toBe(609060);
  });
  it("saldo 100000, a pagar 150000, a receber 80000 => 30000", () => {
    expect(
      projectedBalance({ currentInCents: 100000, toPayInCents: 150000, toReceiveInCents: 80000 }),
    ).toBe(30000);
  });
});
