import { describe, expect, it } from "vitest";
import {
  AssistantLimitsSchema,
  DEFAULT_ASSISTANT_LIMITS,
  describeLimits,
  isRiskier,
} from "@/modules/mcp/limits-schemas";

// US-076b (SDD-027 §R2.3): padrões, regra de risco e validações dos limites do membro.
const D = DEFAULT_ASSISTANT_LIMITS;

describe("limites do assistente", () => {
  it("padrões aceitos pelo usuário (D-GES-37): R$ 500,00 / 10 por dia / 5 por hora", () => {
    expect(D).toEqual({ maxAmountPerTxCents: 50_000, maxTxPerDay: 10, maxTxPerHour: 5 });
  });

  it("isRiskier: padrão e valores menores não exigem ciência; null ou acima do padrão exigem", () => {
    const base = { maxAmountPerTxCents: 50_000, maxTxPerDay: 10, maxTxPerHour: 5 };
    expect(isRiskier(base)).toBe(false);
    expect(isRiskier({ ...base, maxAmountPerTxCents: 100 })).toBe(false);
    expect(isRiskier({ ...base, maxTxPerDay: 1, maxTxPerHour: 1 })).toBe(false);
    expect(isRiskier({ ...base, maxAmountPerTxCents: 50_001 })).toBe(true);
    expect(isRiskier({ ...base, maxTxPerDay: 11 })).toBe(true);
    expect(isRiskier({ ...base, maxTxPerHour: 6 })).toBe(true);
    for (const f of ["maxAmountPerTxCents", "maxTxPerDay", "maxTxPerHour"] as const) {
      expect(isRiskier({ ...base, [f]: null })).toBe(true);
    }
  });

  it("schema: faixas 1..200 por dia, 1..60 por hora, valor > 0; null = sem limite; campo extra recusado", () => {
    const ok = { maxAmountPerTxCents: null, maxTxPerDay: null, maxTxPerHour: null };
    expect(AssistantLimitsSchema.parse(ok).riskAcknowledged).toBe(false);
    const bad = (patch: object) => AssistantLimitsSchema.safeParse({ ...ok, ...patch }).success;
    expect(bad({ maxTxPerDay: 0 })).toBe(false);
    expect(bad({ maxTxPerDay: 201 })).toBe(false);
    expect(bad({ maxTxPerDay: 200 })).toBe(true);
    expect(bad({ maxTxPerHour: 61 })).toBe(false);
    expect(bad({ maxTxPerHour: 60 })).toBe(true);
    expect(bad({ maxAmountPerTxCents: 0 })).toBe(false);
    expect(bad({ maxAmountPerTxCents: 1.5 })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
    expect(bad({ version: 0 })).toBe(false);
  });

  it("describeLimits: texto do consentimento", () => {
    expect(describeLimits(D)).toBe("Até R$ 500,00 por lançamento · 10 por dia · 5 por hora");
    expect(
      describeLimits({ maxAmountPerTxCents: null, maxTxPerDay: null, maxTxPerHour: null }),
    ).toBe("Sem limite");
    expect(describeLimits({ ...D, maxTxPerDay: null })).toBe(
      "Até R$ 500,00 por lançamento · sem limite por dia · 5 por hora",
    );
    expect(describeLimits({ maxAmountPerTxCents: null, maxTxPerDay: 3, maxTxPerHour: 2 })).toBe(
      "Sem limite de valor · 3 por dia · 2 por hora",
    );
  });
});
