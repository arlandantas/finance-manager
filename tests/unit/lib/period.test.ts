import { describe, expect, it } from "vitest";
import { nextPeriod, periodFromKey, periodOf, previousPeriod } from "@/lib/period";

describe("EN-001 period (ADR-010)", () => {
  it("exemplos do SDD-000 §5", () => {
    expect(periodOf("2026-10-04", 1)).toEqual({
      key: "2026-10",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(periodOf("2026-10-04", 15)).toEqual({
      key: "2026-09",
      start: "2026-09-15",
      end: "2026-10-14",
    });
  });

  it("cutDay padrão é 1", () => {
    expect(periodOf("2026-02-10").end).toBe("2026-02-28");
  });

  it("fevereiro bissexto", () => {
    expect(periodOf("2028-02-10", 1).end).toBe("2028-02-29");
  });

  it("virada de ano com cutDay 1, 15 e 28", () => {
    expect(periodOf("2026-12-31", 1)).toEqual({
      key: "2026-12",
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(periodOf("2026-12-20", 15)).toEqual({
      key: "2026-12",
      start: "2026-12-15",
      end: "2027-01-14",
    });
    expect(periodOf("2027-01-10", 15)).toEqual({
      key: "2026-12",
      start: "2026-12-15",
      end: "2027-01-14",
    });
    expect(periodOf("2027-01-05", 28)).toEqual({
      key: "2026-12",
      start: "2026-12-28",
      end: "2027-01-27",
    });
    expect(periodOf("2027-01-28", 28)).toEqual({
      key: "2027-01",
      start: "2027-01-28",
      end: "2027-02-27",
    });
  });

  it("limites do período são contínuos: o dia seguinte ao end é o start do próximo", () => {
    for (const cut of [1, 15, 28]) {
      let p = periodOf("2026-01-20", cut);
      for (let i = 0; i < 24; i++) {
        const n = nextPeriod(p, cut);
        const after = new Date(`${p.end}T00:00:00Z`);
        after.setUTCDate(after.getUTCDate() + 1);
        expect(after.toISOString().slice(0, 10)).toBe(n.start);
        expect(previousPeriod(n, cut)).toEqual(p);
        p = n;
      }
    }
  });

  it("periodFromKey valida e calcula", () => {
    expect(periodFromKey("2026-10")).toEqual({
      key: "2026-10",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(periodFromKey("2026-09", 15)).toEqual({
      key: "2026-09",
      start: "2026-09-15",
      end: "2026-10-14",
    });
    expect(() => periodFromKey("2026-13")).toThrow();
    expect(() => periodFromKey("2026-1")).toThrow();
    expect(() => periodFromKey("abc")).toThrow();
  });

  it("a data pertence ao período devolvido", () => {
    for (const cut of [1, 15, 28]) {
      for (const d of [
        "2026-01-01",
        "2026-01-31",
        "2026-02-28",
        "2026-03-14",
        "2026-03-15",
        "2026-12-31",
      ]) {
        const p = periodOf(d, cut);
        expect(d >= p.start && d <= p.end).toBe(true);
        expect(periodFromKey(p.key, cut)).toEqual(p);
      }
    }
  });
});
