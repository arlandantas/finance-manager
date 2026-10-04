import { describe, expect, it } from "vitest";
import { getClock, systemClock, withClock } from "@/lib/clock";
import { addDays, compareDate, dateISOSchema, daysBetween, todayInFamilyTz } from "@/lib/dates";

const clockAt = (iso: string) => ({ now: () => new Date(iso) });

describe("EN-001 dates", () => {
  it("todayInFamilyTz respeita America/Sao_Paulo (virada de dia)", () => {
    expect(todayInFamilyTz(clockAt("2026-10-04T15:00:00Z"))).toBe("2026-10-04");
    // 02:30 UTC do dia D ainda é D-1 em São Paulo (UTC-3)
    expect(todayInFamilyTz(clockAt("2026-10-05T02:30:00Z"))).toBe("2026-10-04");
    expect(todayInFamilyTz(clockAt("2026-10-05T03:00:00Z"))).toBe("2026-10-05");
  });

  it("addDays atravessa mês/ano/bissexto", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("compareDate e daysBetween", () => {
    expect(compareDate("2026-10-01", "2026-10-02")).toBe(-1);
    expect(compareDate("2026-10-02", "2026-10-02")).toBe(0);
    expect(compareDate("2026-10-03", "2026-10-02")).toBe(1);
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("dateISOSchema valida", () => {
    expect(dateISOSchema.safeParse("2026-10-04").success).toBe(true);
    const bad = dateISOSchema.safeParse("2026-02-30");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe("Data inválida");
  });
});

describe("EN-001 clock", () => {
  it("systemClock devolve uma data", () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
  });

  it("APP_NOW_OVERRIDE vale fora de produção", () => {
    const c = getClock({ NODE_ENV: "development", APP_NOW_OVERRIDE: "2026-10-04T15:00:00Z" });
    expect(c.now().toISOString()).toBe("2026-10-04T15:00:00.000Z");
  });

  it("APP_NOW_OVERRIDE é ignorada em produção", () => {
    const c = getClock({ NODE_ENV: "production", APP_NOW_OVERRIDE: "2000-01-01T00:00:00Z" });
    expect(c.now().getFullYear()).toBeGreaterThan(2020);
  });

  it("withClock injeta relógio fixo e restaura", async () => {
    await withClock("2026-10-04T15:00:00Z", async () => {
      expect(getClock().now().toISOString()).toBe("2026-10-04T15:00:00.000Z");
    });
    expect(getClock().now().getFullYear()).toBeGreaterThan(2020);
  });
});
