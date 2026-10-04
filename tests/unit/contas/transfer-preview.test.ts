import { describe, expect, it } from "vitest";
import { transferPreview } from "@/modules/contas/transfer-preview";

describe("US-010 prévia de saldos da transferência", () => {
  it("origem e destino após a transferência", () => {
    expect(transferPreview({ from: 300000, to: 50000 }, 100000)).toEqual({
      from: 200000,
      to: 150000,
      fromNegative: false,
    });
  });
  it("origem sem saldo suficiente fica negativa (aviso, sem bloqueio)", () => {
    expect(transferPreview({ from: 20000, to: 0 }, 50000)).toEqual({
      from: -30000,
      to: 50000,
      fromNegative: true,
    });
  });
  it("saldo exatamente zero não é negativo", () => {
    expect(transferPreview({ from: 1000, to: 0 }, 1000).fromNegative).toBe(false);
  });
});
