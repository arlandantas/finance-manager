import { describe, expect, it } from "vitest";
import { sortSubscriptions, summarize } from "@/modules/assinaturas/list";
import type { SubscriptionDTO } from "@/modules/assinaturas/schemas";

// US-098 (ADR-036): total mensal em centavos inteiros e total por cartão.
const item = (id: string, card: string, cents: number, description = id) =>
  ({
    id,
    description,
    card: { id: card, name: `Cartão ${card}`, archived: false },
    currentAmountInCents: cents,
  }) as SubscriptionDTO;

describe("summarize", () => {
  it("vazio => 0 e sem cartões", () => {
    expect(summarize([])).toEqual({ totalInCents: 0, byCard: [] });
  });

  it("AC1: 55,90 + 21,90 = 77,80", () => {
    expect(summarize([item("a", "A", 5590), item("b", "A", 2190)]).totalInCents).toBe(7780);
  });

  it("AC2: A 77,80 e B 39,90; Σ byCard = total; maior primeiro", () => {
    const r = summarize([item("a", "A", 5590), item("b", "B", 3990), item("c", "A", 2190)]);
    expect(r.byCard).toEqual([
      { cardId: "A", cardName: "Cartão A", totalInCents: 7780 },
      { cardId: "B", cardName: "Cartão B", totalInCents: 3990 },
    ]);
    expect(r.byCard.reduce((s, c) => s + c.totalInCents, 0)).toBe(r.totalInCents);
  });

  it("limite: 1 centavo x 3 e soma exata sem float", () => {
    const r = summarize([item("a", "A", 1), item("b", "A", 1), item("c", "B", 1)]);
    expect(r.totalInCents).toBe(3);
    const big = summarize([item("a", "A", 9_999_999_999), item("b", "A", 9_999_999_999)]);
    expect(big.totalInCents).toBe(19_999_999_998);
    expect(Number.isSafeInteger(big.totalInCents)).toBe(true);
  });
});

describe("sortSubscriptions", () => {
  it("valor desc, descrição pt-BR, id", () => {
    const r = sortSubscriptions([
      item("3", "A", 100, "Zeta"),
      item("2", "A", 100, "Álbum"),
      item("1", "A", 500, "Netflix"),
      item("0", "A", 100, "Álbum"),
    ]);
    expect(r.map((x) => x.id)).toEqual(["1", "0", "2", "3"]);
  });
});
