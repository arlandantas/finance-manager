import { describe, expect, it } from "vitest";
import { recurringDismissKey } from "@/modules/analise-ia/payload";
import {
  detectRecurring,
  type ExpenseRow,
  normalizeDescription,
  roundHalfUp,
} from "@/modules/analise-ia/recurring";

const row = (
  rel: number,
  description: string,
  amountInCents: number,
  categoryId = "c1",
): ExpenseRow => ({
  rel,
  categoryId,
  description,
  amountInCents,
});

describe("normalizeDescription (SDD-023 §4.2)", () => {
  it.each([
    ["Streaming X", "streaming x"],
    ["  DROGA   Raia  ", "droga raia"],
    ["Café São João 123", "cafe sao joao"],
    ["Pix: Maria 12/10", "pix maria"],
    ["12345", ""],
    ["!!!", ""],
  ])("%s ⇒ %s", (input, out) => {
    expect(normalizeDescription(input)).toBe(out);
  });
  it("corta em 40 caracteres", () => {
    expect(normalizeDescription("a".repeat(80))).toHaveLength(40);
  });
});

describe("roundHalfUp", () => {
  it("meio para cima", () => {
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(4, 2)).toBe(2);
    expect(roundHalfUp(10, 3)).toBe(3);
    expect(roundHalfUp(11, 3)).toBe(4);
  });
});

describe("detectRecurring", () => {
  it("DETECTED: mesma descrição em ≥ 3 períodos (janela de 4) com variação ≤ 1,5", () => {
    const rows = [0, -1, -2, -3].map((r) => row(r, "Streaming X", 5590));
    const out = detectRecurring({ rows, scheduled: [], windowSize: 4 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "DETECTED",
      descriptionKey: "streaming x",
      displayName: "Streaming X",
      monthlyAvgInCents: 5590,
      presentIn: [-3, -2, -1, 0],
      recurringExpenseId: null,
    });
  });

  it("2 períodos não bastam numa janela de 4; bastam numa janela de 3", () => {
    const rows = [row(0, "Academia", 9000), row(-1, "Academia", 9000)];
    expect(detectRecurring({ rows, scheduled: [], windowSize: 4 })).toHaveLength(0);
    expect(detectRecurring({ rows, scheduled: [], windowSize: 3 })).toHaveLength(1);
  });

  it("variação acima de 1,5 não é recorrente; exatamente 1,5 é", () => {
    const wide = [row(0, "Luz", 15001), row(-1, "Luz", 10000), row(-2, "Luz", 10000)];
    expect(detectRecurring({ rows: wide, scheduled: [], windowSize: 4 })).toHaveLength(0);
    const edge = [row(0, "Luz", 15000), row(-1, "Luz", 10000), row(-2, "Luz", 10000)];
    expect(detectRecurring({ rows: edge, scheduled: [], windowSize: 4 })).toHaveLength(1);
  });

  it("soma lançamentos do mesmo período e ignora descrição vazia", () => {
    const rows = [
      row(0, "Padaria", 2000),
      row(0, "padaria", 1000),
      row(-1, "Padaria", 3000),
      row(-2, "Padaria", 3000),
      row(0, "9999", 50000),
      row(-1, "9999", 50000),
      row(-2, "9999", 50000),
    ];
    const out = detectRecurring({ rows, scheduled: [], windowSize: 4 });
    expect(out.map((c) => c.displayName.toLowerCase())).toEqual(["padaria"]);
    expect(out[0]?.monthlyAvgInCents).toBe(3000);
  });

  it("SCHEDULED absorve o DETECTED de mesma descrição", () => {
    const rows = [0, -1, -2].map((r) => row(r, "Internet Fibra", 12000));
    const out = detectRecurring({
      rows,
      scheduled: [
        {
          recurringExpenseId: "s1",
          displayName: "Internet fibra",
          categoryId: "c1",
          byRel: { 0: 12000, [-1]: 12000 },
        },
      ],
      windowSize: 4,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "SCHEDULED",
      recurringExpenseId: "s1",
      descriptionKey: null,
      monthlyAvgInCents: 12000,
    });
  });

  it("SCHEDULED com menos de 2 baixas não conta", () => {
    const out = detectRecurring({
      rows: [],
      scheduled: [
        { recurringExpenseId: "s1", displayName: "X", categoryId: "c", byRel: { 0: 100 } },
      ],
      windowSize: 4,
    });
    expect(out).toHaveLength(0);
  });

  it("descartados saem ANTES do corte em 15; ordena por valor mensal desc; no máximo 15", () => {
    const rows: ExpenseRow[] = [];
    for (let k = 0; k < 17; k++) {
      for (const rel of [0, -1, -2])
        rows.push(row(rel, `Item ${"abcdefghijklmnopq"[k]}`, 1000 + k * 100));
    }
    const all = detectRecurring({ rows, scheduled: [], windowSize: 4 });
    expect(all).toHaveLength(15);
    expect(all[0]?.displayName).toBe("Item q");
    const top = all[0];
    const dismissed = new Set([recurringDismissKey(top as NonNullable<typeof top>)]);
    const after = detectRecurring({ rows, scheduled: [], windowSize: 4, dismissedKeys: dismissed });
    expect(after).toHaveLength(15);
    expect(after.some((c) => c.displayName === "Item q")).toBe(false);
    expect(after[0]?.displayName).toBe("Item p");
  });

  it("categorias diferentes da mesma descrição são grupos separados", () => {
    const rows = [
      row(0, "Mercado", 1000, "a"),
      row(-1, "Mercado", 1000, "a"),
      row(-2, "Mercado", 1000, "a"),
      row(0, "Mercado", 1000, "b"),
    ];
    const out = detectRecurring({ rows, scheduled: [], windowSize: 4 });
    expect(out).toHaveLength(1);
    expect(out[0]?.categoryId).toBe("a");
  });
});
