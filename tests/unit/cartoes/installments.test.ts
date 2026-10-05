import { describe, expect, it } from "vitest";
import { addMonthsToRef, invoiceDates, invoiceRefFor } from "@/modules/cartoes/cycle";
import {
  addMonthsClamped,
  buildInstallments,
  previewInstallments,
  splitInstallments,
} from "@/modules/cartoes/installments";
import { mulberry32 } from "../../support/prng";

describe("splitInstallments (I1, I2, I8, I11)", () => {
  it("I1: toda a sobra na parcela 1", () => {
    expect(splitInstallments(100001, 3)).toEqual([33335, 33333, 33333]);
  });
  it("I2: divisão exata", () => {
    expect(splitInstallments(250000, 10)).toEqual(Array(10).fill(25000));
  });
  it("I8: total menor que a quantidade ou quantidade inválida => RangeError", () => {
    expect(() => splitInstallments(2, 3)).toThrow(RangeError);
    expect(() => splitInstallments(1, 24)).toThrow(RangeError);
    expect(() => splitInstallments(100, 0)).toThrow(RangeError);
    expect(() => splitInstallments(100, 1.5)).toThrow(RangeError);
  });
  it("I11: 1 centavo por parcela e sobra na primeira", () => {
    expect(splitInstallments(24, 24)).toEqual(Array(24).fill(1));
    expect(splitInstallments(25, 24)).toEqual([2, ...Array(23).fill(1)]);
  });
  it("1x devolve o total", () => {
    expect(splitInstallments(777, 1)).toEqual([777]);
  });
});

describe("addMonthsClamped (I3, I4)", () => {
  it("I3: não encadeia (31/01 => 28/02 => 31/03)", () => {
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsClamped("2027-01-31", 2)).toBe("2027-03-31");
  });
  it("I4: bissexto", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });
  it("vira o ano e aceita 0 e 12", () => {
    expect(addMonthsClamped("2026-11-10", 2)).toBe("2027-01-10");
    expect(addMonthsClamped("2026-11-10", 0)).toBe("2026-11-10");
    expect(addMonthsClamped("2026-02-28", 12)).toBe("2027-02-28");
  });
});

describe("buildInstallments (I5..I7, I9, I10, I12)", () => {
  it("I5: compra 10/11, fechamento 25, vencimento 5, 10x", () => {
    const d = buildInstallments({
      totalInCents: 2500000 * 1,
      count: 10,
      purchaseOn: "2026-11-10",
      closingDay: 25,
      dueDay: 5,
    });
    expect(d.map((x) => x.invoiceRef)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ]);
    expect(d[9]?.occurredOn).toBe("2027-08-10");
    expect(d[0]?.competenceOn).toBe("2026-11-25");
    expect(d[9]?.competenceOn).toBe("2027-08-25");
    expect(d.every((x) => x.amountInCents === 250000)).toBe(true);
  });
  it("I6: depois do fechamento a 1ª cai em dezembro", () => {
    const d = buildInstallments({
      totalInCents: 2500000,
      count: 10,
      purchaseOn: "2026-11-28",
      closingDay: 25,
      dueDay: 5,
    });
    expect(d[0]).toMatchObject({
      invoiceRef: "2026-12",
      competenceOn: "2026-12-25",
      occurredOn: "2026-11-28",
    });
    expect(d[1]).toMatchObject({ occurredOn: "2026-12-28", invoiceRef: "2027-01" });
  });
  it("I7: count < 2 => RangeError", () => {
    expect(() =>
      buildInstallments({
        totalInCents: 100,
        count: 1,
        purchaseOn: "2026-11-10",
        closingDay: 25,
        dueDay: 5,
      }),
    ).toThrow(RangeError);
  });
  it("I9: fechamento 28 e compra 31/01 => uma parcela por fatura (ADR-020)", () => {
    const d = buildInstallments({
      totalInCents: 270000,
      count: 3,
      purchaseOn: "2027-01-31",
      closingDay: 28,
      dueDay: 10,
    });
    expect(d.map((x) => x.occurredOn)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(d.map((x) => x.invoiceRef)).toEqual(["2027-02", "2027-03", "2027-04"]);
    expect(d.map((x) => x.competenceOn)).toEqual(["2027-02-28", "2027-03-28", "2027-04-28"]);
    expect(d.every((x) => x.amountInCents === 90000)).toBe(true);
  });
  it("I10: curso 31/01, fechamento 25", () => {
    const d = buildInstallments({
      totalInCents: 180000,
      count: 3,
      purchaseOn: "2027-01-31",
      closingDay: 25,
      dueDay: 5,
    });
    expect(d.map((x) => x.occurredOn)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(d.map((x) => x.invoiceRef)).toEqual(["2027-02", "2027-03", "2027-04"]);
    expect(d.every((x) => x.amountInCents === 60000)).toBe(true);
  });
  it("I12: 24x termina em 2028-10", () => {
    const d = buildInstallments({
      totalInCents: 2400000,
      count: 24,
      purchaseOn: "2026-11-10",
      closingDay: 25,
      dueDay: 5,
    });
    expect(d).toHaveLength(24);
    expect(d[23]).toMatchObject({ invoiceRef: "2028-10", occurredOn: "2028-10-10", no: 24 });
  });
});

describe("previewInstallments", () => {
  it("valores iguais", () => {
    expect(
      previewInstallments({
        totalInCents: 250000,
        count: 10,
        purchaseOn: "2026-11-10",
        closingDay: 25,
      }),
    ).toEqual({
      count: 10,
      firstInCents: 25000,
      othersInCents: 25000,
      sameAmount: true,
      firstInvoiceRef: "2026-11",
    });
  });
  it("com centavos: primeira diferente", () => {
    const p = previewInstallments({
      totalInCents: 100001,
      count: 3,
      purchaseOn: "2026-11-28",
      closingDay: 25,
    });
    expect(p).toMatchObject({
      firstInCents: 33335,
      othersInCents: 33333,
      sameAmount: false,
      firstInvoiceRef: "2026-12",
    });
  });
  it("1x (prévia neutra)", () => {
    expect(
      previewInstallments({
        totalInCents: 1000,
        count: 1,
        purchaseOn: "2026-11-10",
        closingDay: 25,
      }).sameAmount,
    ).toBe(true);
  });
});

describe("propriedades (1000 casos, semente fixa)", () => {
  const rnd = mulberry32(4040);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  it("invariantes de buildInstallments", () => {
    for (let n = 0; n < 1000; n++) {
      const count = int(2, 24);
      const total = int(count, 5_000_000);
      const closingDay = int(1, 28);
      const dueDay = int(1, 28);
      const y = int(2026, 2028);
      const m = int(1, 12);
      const day = int(1, new Date(Date.UTC(y, m, 0)).getUTCDate());
      const purchaseOn = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const args = { totalInCents: total, count, purchaseOn, closingDay, dueDay };
      const d = buildInstallments(args);
      expect(d).toEqual(buildInstallments(args));
      expect(d.reduce((s, x) => s + x.amountInCents, 0)).toBe(total);
      expect(d.every((x) => x.amountInCents >= 1)).toBe(true);
      const [p1, p2] = [d[0]?.amountInCents as number, d[1]?.amountInCents as number];
      expect(p1).toBeGreaterThanOrEqual(p2);
      expect(p1 - p2).toBeLessThanOrEqual(count - 1);
      const ref1 = invoiceRefFor(purchaseOn, closingDay);
      d.forEach((x, i) => {
        expect(x.no).toBe(i + 1);
        expect(x.invoiceRef).toBe(addMonthsToRef(ref1, i));
        expect(x.competenceOn).toBe(invoiceDates(x.invoiceRef, closingDay, dueDay).closingDate);
        if (i > 0) expect(x.competenceOn > (d[i - 1]?.competenceOn as string)).toBe(true);
        // occurredOn_k <= closingDate(ref_k) <= occurredOn_k + 1 mês (com o dia ajustado ao fim do mês, a igualdade ocorre; DEV-47)
        expect(x.occurredOn <= x.competenceOn).toBe(true);
        expect(x.competenceOn <= addMonthsClamped(x.occurredOn, 1)).toBe(true);
      });
    }
  });
});
