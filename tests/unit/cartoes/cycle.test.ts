import { describe, expect, it } from "vitest";
import {
  addMonthsToRef,
  cycleExplanation,
  cycleSentence,
  formatInvoiceLabel,
  invoiceDates,
  invoiceHint,
  invoiceRefFor,
  invoiceStatus,
  openInvoiceRef,
} from "@/modules/cartoes/cycle";

describe("US-016a invoiceRefFor (vetores SDD-008 §4.1)", () => {
  it.each([
    ["2026-10-15", 25, "2026-10"],
    ["2026-10-25", 25, "2026-10"], // dia do fechamento fica na fatura que fecha
    ["2026-10-26", 25, "2026-11"],
    ["2026-12-26", 25, "2027-01"], // virada de ano
    ["2026-10-01", 1, "2026-10"],
    ["2026-10-02", 1, "2026-11"],
    ["2026-02-28", 28, "2026-02"],
    ["2026-03-01", 28, "2026-03"],
  ])("invoiceRefFor(%s, %i) = %s", (date, closing, expected) => {
    expect(invoiceRefFor(date, closing)).toBe(expected);
  });
});

describe("US-015/016a invoiceDates", () => {
  it.each([
    ["2026-10", 25, 5, "2026-10-25", "2026-11-05"],
    ["2026-12", 25, 5, "2026-12-25", "2027-01-05"],
    ["2026-10", 10, 20, "2026-10-10", "2026-10-20"], // vencimento > fechamento: mesmo mês
    ["2026-02", 28, 28, "2026-02-28", "2026-03-28"], // igual: mês seguinte
  ])("invoiceDates(%s, %i, %i)", (ref, c, d, closing, due) => {
    expect(invoiceDates(ref, c, d)).toEqual({ closingDate: closing, dueDate: due });
  });
});

describe("US-017a invoiceStatus", () => {
  const inv = { closingDate: "2026-10-25", dueDate: "2026-11-05", paid: false };
  it.each([
    ["2026-10-25", "OPEN", false],
    ["2026-10-26", "CLOSED", false],
    ["2026-11-05", "CLOSED", false],
    ["2026-11-06", "CLOSED", true],
  ])("hoje %s => %s / vencida %s", (today, status, overdue) => {
    expect(invoiceStatus(inv, today)).toEqual({ status, isOverdue: overdue });
  });
  it("paga => PAID e nunca vencida", () => {
    expect(invoiceStatus({ ...inv, paid: true }, "2026-11-06")).toEqual({
      status: "PAID",
      isOverdue: false,
    });
  });
});

describe("addMonthsToRef / formatInvoiceLabel / openInvoiceRef", () => {
  it("meses", () => {
    expect(addMonthsToRef("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToRef("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToRef("2026-05", 0)).toBe("2026-05");
    expect(addMonthsToRef("2026-05", 14)).toBe("2027-07");
    expect(addMonthsToRef("2026-05", -17)).toBe("2024-12");
  });
  it("rótulo", () => {
    expect(formatInvoiceLabel("2026-10")).toBe("out/2026");
    expect(formatInvoiceLabel("2027-01")).toBe("jan/2027");
  });
  it("fatura aberta hoje", () => {
    expect(openInvoiceRef("2026-10-25", 25)).toBe("2026-10");
    expect(openInvoiceRef("2026-10-26", 25)).toBe("2026-11");
  });
});

describe("US-015 frases do ciclo", () => {
  it("cycleSentence", () => {
    expect(cycleSentence(25, 5)).toBe("Fecha dia 25 · vence dia 5 do mês seguinte");
    expect(cycleSentence(10, 20)).toBe("Fecha dia 10 · vence dia 20 do mesmo mês");
    expect(cycleSentence(28, 28)).toBe("Fecha dia 28 · vence dia 28 do mês seguinte");
  });
  it("cycleExplanation e invoiceHint", () => {
    expect(cycleExplanation(25, 5)).toBe(
      "A fatura fecha no dia 25 e vence no dia 5 do mês seguinte",
    );
    expect(invoiceHint("2026-10-04", 25, 5)).toBe("Entra na fatura de out/2026 · fecha 25/10");
    expect(invoiceHint("2026-10-26", 25, 5)).toBe("Entra na fatura de nov/2026 · fecha 25/11");
  });
});

describe("invoiceDates/invoiceRefFor (propriedade)", () => {
  it("closingDate >= date e < date + 1 mês para todo dia de 2026-2027 e fechamento 1..28", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 730; i += 7) {
      const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      for (let c = 1; c <= 28; c += 3) {
        const { closingDate } = invoiceDates(invoiceRefFor(iso, c), c, ((c + 5) % 28) + 1);
        expect(closingDate >= iso).toBe(true);
        const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
        const limit = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${iso.slice(8, 10)}`;
        expect(closingDate < limit).toBe(true);
      }
    }
  });
});
