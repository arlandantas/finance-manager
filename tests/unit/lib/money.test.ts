import { describe, expect, it } from "vitest";
import {
  amountInCentsSchema,
  formatBRL,
  fromCents,
  MAX_AMOUNT_IN_CENTS,
  parseBRL,
  toCents,
} from "@/lib/money";

const norm = (s: string) => s.replace(/ /g, " ");

describe("EN-001 money: parseBRL", () => {
  it.each([
    ["R$ 1.250,90", 125090],
    ["-R$ 300,00", -30000],
    ["1250,9", 125090],
    ["150,50", 15050],
    ["R$ 0,00", 0],
    ["20", 2000],
    ["1.000", 100000],
    ["  R$ 5.000,00 ", 500000],
    ["-300", -30000],
    ["R$ -300,00", -30000],
  ])("parseBRL(%j) = %j", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(["abc", "", "   ", "R$", "1,234", "1,2,3", "--5", "12a", "1,", ",5"])(
    "parseBRL(%j) = null",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );

  it("nunca usa ponto flutuante (sem erros de arredondamento)", () => {
    expect(parseBRL("0,29")).toBe(29);
    expect(parseBRL("1,15")).toBe(115);
    expect(parseBRL("19,99")).toBe(1999);
  });
});

describe("EN-001 money: formatBRL", () => {
  it("formata centavos em reais", () => {
    expect(norm(formatBRL(125090))).toBe("R$ 1.250,90");
    expect(norm(formatBRL(0))).toBe("R$ 0,00");
    expect(norm(formatBRL(5))).toBe("R$ 0,05");
    expect(norm(formatBRL(84950))).toBe("R$ 849,50");
  });

  it("negativos usam sinal antes do R$ (cenário: saldo inicial negativo)", () => {
    expect(norm(formatBRL(-30000))).toBe("-R$ 300,00");
  });

  it("round-trip com parseBRL", () => {
    for (const n of [0, 1, 99, 100, 12345, -12345, 9_999_999_999]) {
      expect(parseBRL(formatBRL(n))).toBe(n);
    }
  });
});

describe("EN-001 money: BigInt na borda", () => {
  it("toCents converte e fromCents volta", () => {
    expect(toCents(123n)).toBe(123);
    expect(fromCents(123)).toBe(123n);
  });

  it("toCents lança fora da faixa segura", () => {
    expect(() => toCents(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
  });

  it("fromCents rejeita não inteiros", () => {
    expect(() => fromCents(1.5)).toThrow();
  });
});

describe("EN-001 money: amountInCentsSchema", () => {
  const msg = "Informe um valor maior que zero";
  it.each([0, -5, 1.5, Number.NaN])("rejeita %j com a mensagem do PO", (v) => {
    const r = amountInCentsSchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(msg);
  });

  it("rejeita ausente", () => {
    const r = amountInCentsSchema.safeParse(undefined);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(msg);
  });

  it("aceita o limite e rejeita acima", () => {
    expect(amountInCentsSchema.safeParse(MAX_AMOUNT_IN_CENTS).success).toBe(true);
    const r = amountInCentsSchema.safeParse(MAX_AMOUNT_IN_CENTS + 1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Valor acima do limite permitido");
  });
});
