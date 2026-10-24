import { describe, expect, it } from "vitest";
import {
  computeSuggestions,
  dismissKey,
  type SuggestionRow,
} from "@/modules/analise-ia/rules-category-suggestion";

const row = (i: number, categoryId: string, key = "droga raia"): SuggestionRow => ({
  id: `t${i}`,
  version: 1,
  description: "Droga Raia",
  descriptionKey: key,
  occurredOn: `2026-10-${String(i + 1).padStart(2, "0")}`,
  amountInCents: 1000,
  categoryId,
});
const make = (inM: number, other: number, key = "droga raia") => [
  ...Array.from({ length: inM }, (_, i) => row(i, "saude", key)),
  ...Array.from({ length: other }, (_, i) => row(inM + i, "lazer", key)),
];
const base = { eligibleCategoryIds: new Set(["saude", "lazer"]), dismissed: new Set<string>() };

describe("regra local de sugestão de categoria (SDD-023 §4.6)", () => {
  it("9 em Saúde + 1 em Lazer ⇒ uma sugestão Lazer → Saúde", () => {
    const out = computeSuggestions(make(9, 1), base);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ toCategoryId: "saude", countInTarget: 9, total: 10 });
    expect(out[0]?.row.categoryId).toBe("lazer");
  });

  it("6 / 4 ⇒ nenhuma (60% < 70%)", () => {
    expect(computeSuggestions(make(6, 4), base)).toEqual([]);
  });

  it("limite exato de 70% (7 de 10) sugere; 69% não", () => {
    expect(computeSuggestions(make(7, 3), base)).toHaveLength(3);
    expect(computeSuggestions(make(2, 1), base)).toEqual([]); // só 3 lançamentos: 66,7%
  });

  it("2 lançamentos ⇒ nenhuma (mínimo de 3)", () => {
    expect(computeSuggestions(make(1, 1), base)).toEqual([]);
    expect(computeSuggestions(make(2, 0), base)).toEqual([]);
  });

  it("3 lançamentos, 2 na majoritária (66%) ⇒ nenhuma; 3 de 3 ⇒ nada a sugerir", () => {
    expect(computeSuggestions(make(3, 0), base)).toEqual([]);
  });

  it("categoria majoritária arquivada ou de outro tipo ⇒ nenhuma", () => {
    expect(
      computeSuggestions(make(9, 1), { ...base, eligibleCategoryIds: new Set(["lazer"]) }),
    ).toEqual([]);
  });

  it("recusa (descrição, categoria sugerida) silencia a sugestão", () => {
    const out = computeSuggestions(make(9, 1), {
      ...base,
      dismissed: new Set([dismissKey("droga raia", "saude")]),
    });
    expect(out).toEqual([]);
  });

  it("recusa para outra categoria não silencia", () => {
    const out = computeSuggestions(make(9, 1), {
      ...base,
      dismissed: new Set([dismissKey("droga raia", "lazer")]),
    });
    expect(out).toHaveLength(1);
  });

  it("descrições diferentes são independentes; ordena por data decrescente e respeita o limite", () => {
    const rows = [
      ...make(9, 1, "droga raia"),
      ...make(8, 2, "mercado x").map((r, i) => ({ ...r, id: `m${i}` })),
    ];
    const out = computeSuggestions(rows, base);
    expect(out).toHaveLength(3);
    const dates = out.map((o) => o.row.occurredOn);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(computeSuggestions(rows, { ...base, limit: 2 })).toHaveLength(2);
  });

  it("empate na majoritária não sugere", () => {
    expect(computeSuggestions(make(5, 5), base)).toEqual([]);
  });
});
