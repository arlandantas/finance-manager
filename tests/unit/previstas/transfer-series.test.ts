import { describe, expect, it } from "vitest";
import {
  addMonths,
  endMonthFromCount,
  HORIZON,
  lastDayOfMonth,
  type MonthISO,
  monthsToGenerate,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";
import {
  CreateTransferSeriesSchema,
  UpdateTransferSeriesSchema,
} from "@/modules/previstas/transfer-schemas";

// US-101: varredura de datas (dia 1..31 x todos os meses 2024..2101) e contrato dos schemas.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ok = {
  fromAccountId: A,
  toAccountId: B,
  amountInCents: 1,
  dayOfMonth: 5,
  startMonth: "2026-12",
  end: { kind: "NONE" },
};

describe("datas da série (varredura)", () => {
  it("todo dia 1..31 em todo mês vira data válida: o dia pedido ou o último do mês", () => {
    for (let m: MonthISO = "2024-01"; m <= "2101-12"; m = addMonths(m, 1)) {
      const last = lastDayOfMonth(m);
      for (let day = 1; day <= 31; day++) {
        const due = occurrenceDueOn(m, day);
        const d = Number(due.slice(8, 10));
        expect(due.slice(0, 7)).toBe(m);
        expect(d).toBe(Math.min(day, last));
        expect(new Date(`${due}T00:00:00Z`).getUTCDate()).toBe(d); // data existe de fato
      }
    }
  });

  it("fevereiro: 28 em comum, 29 em bissexto (incl. 2100, que não é)", () => {
    expect(occurrenceDueOn("2027-02", 31)).toBe("2027-02-28");
    expect(occurrenceDueOn("2028-02", 30)).toBe("2028-02-29");
    expect(occurrenceDueOn("2100-02", 29)).toBe("2100-02-28");
  });

  it("geração: nunca passa de 12 meses, é contígua, sem repetir, e respeita o fim", () => {
    for (let n = 1; n <= 120; n += 7) {
      for (const through of [null, "2026-12", "2027-05", "2027-11"] as const) {
        const start: MonthISO = "2026-12";
        const months = monthsToGenerate(
          {
            startMonth: start,
            endMonth: endMonthFromCount(start, n),
            generatedThroughMonth: through,
            endedAt: null,
          },
          "2026-12",
          HORIZON,
        );
        expect(months.length).toBeLessThanOrEqual(HORIZON);
        expect(new Set(months).size).toBe(months.length);
        for (const m of months) expect(m <= endMonthFromCount(start, n)).toBe(true);
        months.forEach((m, i) => i > 0 && expect(m).toBe(addMonths(months[i - 1] as MonthISO, 1)));
      }
    }
  });
});

describe("schemas da série de transferência", () => {
  it("aceita o corpo válido e recusa origem/destino ausentes, iguais, campo extra e dia fora de 1..31", () => {
    expect(CreateTransferSeriesSchema.safeParse(ok).success).toBe(true);
    expect(CreateTransferSeriesSchema.safeParse({ ...ok, fromAccountId: undefined }).success).toBe(
      false,
    );
    expect(CreateTransferSeriesSchema.safeParse({ ...ok, toAccountId: undefined }).success).toBe(
      false,
    );
    expect(CreateTransferSeriesSchema.safeParse({ ...ok, toAccountId: A }).success).toBe(false);
    expect(CreateTransferSeriesSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    for (const dayOfMonth of [0, 32, 1.5]) {
      expect(CreateTransferSeriesSchema.safeParse({ ...ok, dayOfMonth }).success).toBe(false);
    }
    for (const amountInCents of [0, -1, 1.5]) {
      expect(CreateTransferSeriesSchema.safeParse({ ...ok, amountInCents }).success).toBe(false);
    }
    expect(
      CreateTransferSeriesSchema.safeParse({ ...ok, end: { kind: "COUNT", months: 121 } }).success,
    ).toBe(false);
    expect(
      CreateTransferSeriesSchema.safeParse({ ...ok, end: { kind: "COUNT", months: 120 } }).success,
    ).toBe(true);
  });

  it("update é strict e exige version", () => {
    expect(UpdateTransferSeriesSchema.safeParse({ version: 1, amountInCents: 5 }).success).toBe(
      true,
    );
    expect(UpdateTransferSeriesSchema.safeParse({ amountInCents: 5 }).success).toBe(false);
    expect(UpdateTransferSeriesSchema.safeParse({ version: 1, familyId: A }).success).toBe(false);
  });
});
