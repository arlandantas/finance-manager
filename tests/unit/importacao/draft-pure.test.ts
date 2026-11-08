import { describe, expect, it } from "vitest";
import { defaultSelected, GROUPS, isItemSelectable } from "@/modules/importacao/groups";
import { importKey, importKeys } from "@/modules/importacao/import-key";
import { reconcileTotal, type TotalItem } from "@/modules/importacao/total";

const item = (over: Partial<Parameters<typeof importKey>[2]> = {}) => ({
  date: "2026-10-03",
  amountInCents: "12345",
  description: "Mercado Bom Preço",
  installment: null,
  ...over,
});
const CARD = "c0000000-0000-4000-8000-000000000001";

describe("US-067 importKey (AC 5)", () => {
  it("é sha256 hex estável e separa itens idênticos pelo ordinal", () => {
    const [a, b] = importKeys(CARD, "2026-10", [item(), item()]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(importKeys(CARD, "2026-10", [item(), item()])).toEqual([a, b]);
    expect(a).toBe(importKey(CARD, "2026-10", item(), 1));
    expect(b).toBe(importKey(CARD, "2026-10", item(), 2));
  });

  it("o ordinal conta só entre idênticos; descrição normalizada e n/N entram na chave", () => {
    const keys = importKeys(CARD, "2026-10", [
      item(),
      item({ description: "OUTRA" }),
      item({ description: "MERCADO BOM PRECO" }), // idêntico ao 1º após normalizar
      item({ installment: { no: 4, count: 10 } }),
    ]);
    expect(new Set(keys).size).toBe(4);
    expect(keys[2]).toBe(importKey(CARD, "2026-10", item(), 2));
    expect(keys[1]).toBe(importKey(CARD, "2026-10", item({ description: "OUTRA" }), 1));
  });

  it("cartão, fatura, data e valor mudam a chave", () => {
    const base = importKey(CARD, "2026-10", item(), 1);
    expect(importKey("c0000000-0000-4000-8000-000000000002", "2026-10", item(), 1)).not.toBe(base);
    expect(importKey(CARD, "2026-11", item(), 1)).not.toBe(base);
    expect(importKey(CARD, "2026-10", item({ date: "2026-10-04" }), 1)).not.toBe(base);
    expect(importKey(CARD, "2026-10", item({ amountInCents: "12346" }), 1)).not.toBe(base);
  });
});

describe("US-067 padrões de grupo (AC 1)", () => {
  it("PURCHASE marcado; FEE em Encargos desmarcado; CREDIT e PAYMENT em grupos próprios", () => {
    expect(defaultSelected("PURCHASE")).toBe(true);
    expect(defaultSelected("FEE")).toBe(false);
    expect(GROUPS.FEE).toBe("Encargos");
    expect(GROUPS.CREDIT).toBe("Estornos e créditos");
    expect(GROUPS.PAYMENT).toBe("Pagamento da fatura");
  });

  it("selecionável: só compra/encargo sem ALREADY_*; POSSIBLE_DUPLICATE continua selecionável", () => {
    expect(isItemSelectable({ kind: "PURCHASE", flags: [] })).toBe(true);
    expect(isItemSelectable({ kind: "FEE", flags: [] })).toBe(true);
    expect(isItemSelectable({ kind: "CREDIT", flags: [] })).toBe(false);
    expect(isItemSelectable({ kind: "PAYMENT", flags: [] })).toBe(false);
    expect(isItemSelectable({ kind: "PURCHASE", flags: ["ALREADY_IMPORTED"] })).toBe(false);
    expect(isItemSelectable({ kind: "PURCHASE", flags: ["ALREADY_POSTED_PARCEL"] })).toBe(false);
    expect(isItemSelectable({ kind: "PURCHASE", flags: ["POSSIBLE_DUPLICATE"] })).toBe(true);
  });
});

const t = (
  kind: TotalItem["kind"],
  amountInCents: string | bigint | null,
  selected = false,
): TotalItem => ({ kind, amountInCents, selected });

describe("US-067 reconcileTotal (AC 6)", () => {
  it("Σ com 1 centavo, estorno subtraído, PAYMENT ignorado, diferença com sinal", () => {
    const items = [
      t("PURCHASE", "10000", true),
      t("FEE", "1", false),
      t("CREDIT", "2500"),
      t("PAYMENT", "99999"),
    ];
    expect(reconcileTotal(items, "7501")).toEqual({
      itemsTotal: 7501n,
      selectedTotal: 10000n,
      difference: 0n,
    });
    expect(reconcileTotal(items, "7000").difference).toBe(-501n);
    expect(reconcileTotal(items, 8000n).difference).toBe(499n);
  });

  it("sem total declarado a diferença é 0; valores nulos valem 0", () => {
    expect(reconcileTotal([t("PURCHASE", null, true)]).difference).toBe(0n);
    expect(reconcileTotal([], null)).toEqual({ itemsTotal: 0n, selectedTotal: 0n, difference: 0n });
  });

  it("não perde precisão acima de 2^53", () => {
    const big = "9007199254740993";
    expect(reconcileTotal([t("PURCHASE", big, true)], big).itemsTotal).toBe(9007199254740993n);
  });

  it("propriedade: sem estorno, Σ selecionados ≤ Σ itens; PAYMENT nunca muda o total", () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    for (let run = 0; run < 200; run++) {
      const items: TotalItem[] = Array.from({ length: rnd(12) }, () =>
        t(
          ["PURCHASE", "FEE"][rnd(2)] as "PURCHASE" | "FEE",
          String(1 + rnd(1_000_000)),
          rnd(2) === 0,
        ),
      );
      const r = reconcileTotal(items, "123");
      expect(r.selectedTotal <= r.itemsTotal).toBe(true);
      const withPay = reconcileTotal([...items, t("PAYMENT", "777", true)], "123");
      expect(withPay).toEqual(r);
    }
  });
});
