import { describe, expect, it } from "vitest";
import { apportion } from "@/lib/apportion";

const pct = (weights: number[]) =>
  Object.values(
    apportion(
      100,
      weights.map((weight, i) => ({ key: String(i), weight, ordinal: i })),
    ),
  );

describe("US-012 participação por membro (apportion 100)", () => {
  it("90000/30000 => 75/25", () => expect(pct([90000, 30000])).toEqual([75, 25]));
  it("3 membros iguais somam 100", () => {
    const r = pct([1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r).toEqual([34, 33, 33]);
  });
});
