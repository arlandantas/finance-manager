import { describe, expect, it } from "vitest";
import { addMonthsToRef, invoiceDates, invoiceRefFor } from "@/modules/cartoes/cycle";
import {
  addMonthsClamped,
  buildInstallments,
  buildRemainingInstallments,
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
      paidBeforeApp: 0,
      remainingCount: 10,
      nextNo: 1,
      remainingEachInCents: 25000,
      remainingTotalInCents: 250000,
      remainderOnPaidParcel: false,
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

describe("buildRemainingInstallments (US-065, SDD-020 P1..P8)", () => {
  const base = { closingDay: 25, dueDay: 5 };
  it("P1: 2.500,00 em 10x, 4 pagas, âncora 2026-11-10", () => {
    const d = buildRemainingInstallments({
      ...base,
      totalInCents: 250000,
      count: 10,
      paidBeforeApp: 4,
      anchorOn: "2026-11-10",
    });
    expect(d).toHaveLength(6);
    expect(d.map((x) => x.no)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(d.every((x) => x.amountInCents === 25000)).toBe(true);
    expect(d.map((x) => x.invoiceRef)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
    ]);
    expect(d[0]?.competenceOn).toBe("2026-11-25");
    expect(d[5]?.competenceOn).toBe("2027-04-25");
    expect(d[0]?.occurredOn).toBe("2026-11-10");
    expect(d[5]?.occurredOn).toBe("2027-04-10");
  });

  it("P2: P = 0 é idêntico a buildInstallments", () => {
    for (const [total, count, purchaseOn, closingDay, dueDay] of [
      [250000, 10, "2026-11-10", 25, 5],
      [100001, 3, "2026-11-28", 25, 5],
      [10, 2, "2027-01-31", 28, 10],
      [999999, 24, "2026-10-25", 25, 5],
      [2, 2, "2026-02-28", 1, 15],
    ] as const) {
      const a = { totalInCents: total, count, closingDay, dueDay };
      expect(buildRemainingInstallments({ ...a, paidBeforeApp: 0, anchorOn: purchaseOn })).toEqual(
        buildInstallments({ ...a, purchaseOn }),
      );
    }
  });

  it("P3: resto de centavos fica na 1ª, paga", () => {
    const d = buildRemainingInstallments({
      ...base,
      totalInCents: 100001,
      count: 3,
      paidBeforeApp: 1,
      anchorOn: "2026-11-10",
    });
    expect(d.map((x) => [x.no, x.amountInCents])).toEqual([
      [2, 33333],
      [3, 33333],
    ]);
    const p = previewInstallments({
      totalInCents: 100001,
      count: 3,
      purchaseOn: "2026-11-10",
      closingDay: 25,
      paidBeforeApp: 1,
    });
    expect(p.remainderOnPaidParcel).toBe(true);
    expect(
      splitInstallments(100001, 3)
        .slice(0, 1)
        .reduce((a, b) => a + b, 0),
    ).toBe(33335);
    expect(p.remainingEachInCents).toBe(33333);
    expect(p.remainingTotalInCents).toBe(66666);
  });

  it("P4: restando só 1 parcela", () => {
    const d = buildRemainingInstallments({
      ...base,
      totalInCents: 250000,
      count: 10,
      paidBeforeApp: 9,
      anchorOn: "2026-11-10",
    });
    expect(d).toHaveLength(1);
    expect(d[0]?.no).toBe(10);
  });

  it("P5: P fora de 0..N-1 lança RangeError", () => {
    for (const paidBeforeApp of [10, -1, 1.5]) {
      expect(() =>
        buildRemainingInstallments({
          ...base,
          totalInCents: 250000,
          count: 10,
          paidBeforeApp,
          anchorOn: "2026-11-10",
        }),
      ).toThrow(RangeError);
    }
    expect(() =>
      previewInstallments({
        totalInCents: 250000,
        count: 10,
        purchaseOn: "2026-11-10",
        closingDay: 25,
        paidBeforeApp: 10,
      }),
    ).toThrow(RangeError);
  });

  it("P6: âncora após o fechamento cai na fatura seguinte", () => {
    const d = buildRemainingInstallments({
      ...base,
      totalInCents: 250000,
      count: 10,
      paidBeforeApp: 4,
      anchorOn: "2026-11-28",
    });
    expect(d[0]?.no).toBe(5);
    expect(d[0]?.invoiceRef).toBe("2026-12");
  });

  it("P7: âncora = closingDate da fatura fechada anterior", () => {
    const d = buildRemainingInstallments({
      ...base,
      totalInCents: 250000,
      count: 10,
      paidBeforeApp: 4,
      anchorOn: "2026-10-25",
    });
    expect(d[0]?.invoiceRef).toBe("2026-10");
  });

  it("P8: fechamento 28 e âncora 31/01 geram uma parcela por fatura", () => {
    const d = buildRemainingInstallments({
      totalInCents: 60000,
      count: 6,
      paidBeforeApp: 3,
      anchorOn: "2027-01-31",
      closingDay: 28,
      dueDay: 10,
    });
    expect(d.map((x) => x.invoiceRef)).toEqual(["2027-02", "2027-03", "2027-04"]);
  });

  it("prévia com P = 0 não muda o comportamento anterior", () => {
    const p = previewInstallments({
      totalInCents: 250000,
      count: 10,
      purchaseOn: "2026-11-10",
      closingDay: 25,
    });
    expect(p).toMatchObject({ paidBeforeApp: 0, remainingCount: 10, nextNo: 1 });
    expect(p.remainderOnPaidParcel).toBe(false);
  });

  it("propriedade (1000 casos, semente fixa)", () => {
    const rnd = mulberry32(6565);
    const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    for (let n = 0; n < 1000; n++) {
      const count = int(2, 24);
      const paidBeforeApp = int(0, count - 1);
      const total = int(count, 5_000_000);
      const closingDay = int(1, 28);
      const dueDay = int(1, 28);
      const y = int(2026, 2028);
      const m = int(1, 12);
      const day = int(1, new Date(Date.UTC(y, m, 0)).getUTCDate());
      const anchorOn = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const d = buildRemainingInstallments({
        totalInCents: total,
        count,
        paidBeforeApp,
        anchorOn,
        closingDay,
        dueDay,
      });
      const amounts = splitInstallments(total, count);
      expect(d).toHaveLength(count - paidBeforeApp);
      const paidSum = amounts.slice(0, paidBeforeApp).reduce((a, b) => a + b, 0);
      expect(d.reduce((s, x) => s + x.amountInCents, 0) + paidSum).toBe(total);
      expect(d.map((x) => x.no)).toEqual(
        Array.from({ length: count - paidBeforeApp }, (_, k) => paidBeforeApp + k + 1),
      );
      expect(d[d.length - 1]?.no).toBe(count);
      const ref1 = invoiceRefFor(anchorOn, closingDay);
      d.forEach((x, i) => {
        expect(x.invoiceRef).toBe(addMonthsToRef(ref1, i));
        expect(x.competenceOn).toBe(invoiceDates(x.invoiceRef, closingDay, dueDay).closingDate);
        expect(x.occurredOn <= x.competenceOn).toBe(true);
        expect(x.competenceOn <= addMonthsClamped(x.occurredOn, 1)).toBe(true);
      });
    }
  });
});
