import { describe, expect, it } from "vitest";
import { activeFilterCount, parseFilters } from "@/app/(app)/extrato/filters";

const sp = (q: string) => new URLSearchParams(q);

describe("filtro Divisão (US-053)", () => {
  it("vale quando o acerto está ligado", () => {
    const f = parseFilters(sp("shared=true"));
    expect(f.shared).toBe(true);
    expect(activeFilterCount(f)).toBe(1);
  });

  it("é ignorado quando o acerto está desligado", () => {
    const f = parseFilters(sp("shared=false&period=2026-10"), false);
    expect(f.shared).toBeUndefined();
    expect(activeFilterCount(f)).toBe(0);
  });
});
