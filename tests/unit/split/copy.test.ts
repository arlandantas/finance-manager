import { describe, expect, it } from "vitest";
import { SPLIT_COPY } from "@/modules/split/copy";
import { heroText } from "@/modules/split/hero";

const DEVE = /\bdeve(m)?\b/i;
const m = { id: "1", name: "Lucas Silva", image: null };
const n = { id: "2", name: "Mariana Silva", image: null };

describe("US-028 linguagem neutra (RN-019.4)", () => {
  it("nenhuma constante de copy.ts contém 'deve'", () => {
    const texts = Object.values(SPLIT_COPY).map((v) =>
      typeof v === "function"
        ? (v as (...a: never[]) => string)(...(["Lucas", "Mariana", "R$ 1,00"] as never[]))
        : v,
    );
    for (const t of texts) expect(t, t).not.toMatch(DEVE);
  });

  it("herói do acerto pendente: 'Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana'", () => {
    const h = heroText({
      status: "PENDING",
      suggestions: [{ from: m, to: n, amountInCents: 40000 }],
    });
    expect(h.title.replace(/ /g, " ")).toBe(
      "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana",
    );
    expect(h.title).not.toMatch(DEVE);
  });

  it("vazio usa 'Nenhuma despesa dividida neste mês'", () => {
    expect(heroText({ status: "EMPTY", suggestions: [] }).title).toBe(
      "Nenhuma despesa dividida neste mês",
    );
  });

  it("plurais do indicador e do 'Só meu'", () => {
    expect(SPLIT_COPY.indicatorPrevious(1, "R$ 1,00")).toContain("1 mês (");
    expect(SPLIT_COPY.indicatorPrevious(2, "R$ 1,00")).toContain("2 meses (");
    expect(SPLIT_COPY.personal(1, "R$ 5,00")).toBe("1 despesa Só meu neste mês (R$ 5,00)");
    expect(SPLIT_COPY.personal(2, "R$ 5,00")).toBe("2 despesas Só meu neste mês (R$ 5,00)");
  });
});
