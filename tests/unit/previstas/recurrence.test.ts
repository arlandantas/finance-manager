import { describe, expect, it } from "vitest";
import {
  addMonths,
  endMonthFromCount,
  type MonthISO,
  monthsToGenerate,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";

// SDD-019 §3.7 (unidade).
const m = (s: string) => s as MonthISO;
const base = { endMonth: null, generatedThroughMonth: null, endedAt: null };

describe("occurrenceDueOn (US-058, dia 29–31)", () => {
  it("31 em fev/2026 vence 28; fev/2028 (bissexto) 29; abril 30", () => {
    expect(occurrenceDueOn(m("2026-02"), 31)).toBe("2026-02-28");
    expect(occurrenceDueOn(m("2028-02"), 31)).toBe("2028-02-29");
    expect(occurrenceDueOn(m("2026-04"), 31)).toBe("2026-04-30");
    expect(occurrenceDueOn(m("2026-01"), 31)).toBe("2026-01-31");
  });
  it("dia 10 e dia 1 ficam como pedidos", () => {
    expect(occurrenceDueOn(m("2026-02"), 10)).toBe("2026-02-10");
    expect(occurrenceDueOn(m("2026-11"), 1)).toBe("2026-11-01");
  });
});

describe("monthsToGenerate", () => {
  it("sem fim: 12 meses a partir do corrente, com virada de ano", () => {
    const r = monthsToGenerate({ ...base, startMonth: m("2026-10") }, m("2026-10"));
    expect(r).toHaveLength(12);
    expect(r[0]).toBe("2026-10");
    expect(r[3]).toBe("2027-01");
    expect(r[11]).toBe("2027-09");
  });
  it("por 6 meses: 6 e sem o 7º", () => {
    const endMonth = endMonthFromCount(m("2026-10"), 6);
    expect(endMonth).toBe("2027-03");
    const r = monthsToGenerate({ ...base, startMonth: m("2026-10"), endMonth }, m("2026-10"));
    expect(r).toHaveLength(6);
    expect(r).not.toContain("2027-04");
  });
  it("início futuro", () => {
    const r = monthsToGenerate({ ...base, startMonth: m("2027-01") }, m("2026-10"));
    expect(r[0]).toBe("2027-01");
    expect(r[r.length - 1]).toBe("2027-09");
  });
  it("horizonte já gerado: vazio; avanço de um mês: só o novo", () => {
    const s = { ...base, startMonth: m("2026-10"), generatedThroughMonth: m("2027-09") };
    expect(monthsToGenerate(s, m("2026-10"))).toEqual([]);
    expect(monthsToGenerate(s, m("2026-11"))).toEqual(["2027-10"]);
  });
  it("série encerrada não gera", () => {
    expect(
      monthsToGenerate({ ...base, startMonth: m("2026-10"), endedAt: new Date() }, m("2026-10")),
    ).toEqual([]);
  });
});

describe("endMonthFromCount / addMonths", () => {
  it("conta a partir do início", () => {
    expect(endMonthFromCount(m("2026-10"), 1)).toBe("2026-10");
    expect(endMonthFromCount(m("2026-12"), 2)).toBe("2027-01");
    expect(() => endMonthFromCount(m("2026-10"), 0)).toThrow();
  });
  it("addMonths atravessa anos", () => {
    expect(addMonths(m("2026-12"), 1)).toBe("2027-01");
    expect(addMonths(m("2026-01"), -1)).toBe("2025-12");
    expect(addMonths(m("2026-10"), 11)).toBe("2027-09");
  });
});
