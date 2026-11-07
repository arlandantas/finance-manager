import { describe, expect, it } from "vitest";
import {
  amountFor,
  chargeDateOf,
  endMonthOfSubscription,
  firstChargeOn,
  nextAfter,
} from "@/modules/assinaturas/schedule";
import type { MonthISO } from "@/modules/previstas/recurrence";

describe("chargeDateOf", () => {
  it("dia 31 em fev/2027 => 28/02; 29 em fev/2028 => 29/02", () => {
    expect(chargeDateOf("2027-02", 31)).toBe("2027-02-28");
    expect(chargeDateOf("2028-02", 29)).toBe("2028-02-29");
    expect(chargeDateOf("2027-04", 31)).toBe("2027-04-30");
    expect(chargeDateOf("2026-11", 10)).toBe("2026-11-10");
  });
});

describe("firstChargeOn", () => {
  it("cadastro em 20/11: dia 10 => 10/12; dia 20 => 20/11 (hoje conta)", () => {
    expect(firstChargeOn("2026-11", 10, "2026-11-20")).toBe("2026-12-10");
    expect(firstChargeOn("2026-11", 20, "2026-11-20")).toBe("2026-11-20");
    expect(firstChargeOn("2026-11", 25, "2026-11-20")).toBe("2026-11-25");
  });

  it("início futuro ignora hoje", () => {
    expect(firstChargeOn("2027-03", 5, "2026-11-20")).toBe("2027-03-05");
  });

  it("propriedade (varredura): nunca retroativa, no dia certo e no mês de início ou no seguinte", () => {
    const month = (idx: number) =>
      `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}` as MonthISO;
    for (let idx = 2026 * 12; idx < 2026 * 12 + 24; idx++) {
      for (const dd of [1, 15, 28, 29, 30, 31]) {
        const today = `${month(idx)}-${String(dd).padStart(2, "0")}`.replace(/-(29|30|31)$/, "-28");
        for (let off = 0; off < 12; off++) {
          for (let day = 1; day <= 31; day++) {
            const start = month(idx + off);
            const first = firstChargeOn(start, day, today);
            expect(first >= today).toBe(true);
            expect(first.slice(0, 7) >= start).toBe(true);
            expect(first).toBe(chargeDateOf(first.slice(0, 7) as MonthISO, day));
            expect(first.slice(0, 7) <= month(idx + off + 1) || start > month(idx)).toBe(true);
          }
        }
      }
    }
  });
});

describe("nextAfter / endMonth", () => {
  it("avança um mês; nulo depois do fim", () => {
    expect(nextAfter("2026-12", 31, null)).toEqual({ month: "2027-01", on: "2027-01-31" });
    expect(nextAfter("2027-01", 31, null)).toEqual({ month: "2027-02", on: "2027-02-28" });
    expect(nextAfter("2026-12", 10, "2026-12")).toBeNull();
    expect(nextAfter("2026-11", 10, "2026-12")).toEqual({ month: "2026-12", on: "2026-12-10" });
  });

  it("COUNT 3 termina no 3º mês de cobrança", () => {
    expect(endMonthOfSubscription("2026-12-10", { type: "COUNT", count: 3 })).toBe("2027-02");
    expect(endMonthOfSubscription("2026-12-10", { type: "NONE" })).toBeNull();
    expect(endMonthOfSubscription("2026-12-10", { type: "COUNT", count: 1 })).toBe("2026-12");
  });
});

describe("amountFor", () => {
  const d = (s: string) => new Date(s);
  const rows = [
    { fromMonth: "2026-11" as const, amountInCents: 3990, createdAt: d("2026-11-01T10:00:00Z") },
    { fromMonth: "2027-02" as const, amountInCents: 4590, createdAt: d("2027-01-10T10:00:00Z") },
    { fromMonth: "2027-06" as const, amountInCents: 5590, createdAt: d("2027-05-10T10:00:00Z") },
  ];
  it("dois reajustes: maior fromMonth <= mês", () => {
    expect(amountFor("2026-11", rows)).toBe(3990);
    expect(amountFor("2027-01", rows)).toBe(3990);
    expect(amountFor("2027-02", rows)).toBe(4590);
    expect(amountFor("2027-05", rows)).toBe(4590);
    expect(amountFor("2028-01", rows)).toBe(5590);
  });
  it("antes da primeira vigência => null; empate => createdAt mais recente", () => {
    expect(amountFor("2026-10", rows)).toBeNull();
    const tie = [
      { fromMonth: "2027-02" as const, amountInCents: 100, createdAt: d("2027-01-01T00:00:00Z") },
      { fromMonth: "2027-02" as const, amountInCents: 200, createdAt: d("2027-01-02T00:00:00Z") },
    ];
    expect(amountFor("2027-03", tie)).toBe(200);
  });
});
