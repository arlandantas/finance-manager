import { describe, expect, it } from "vitest";
import { assertLlmConfig, DEFAULT_MONTHLY_CAP_CENTS } from "@/modules/ia/config";
import { aiMonthKey, monthKeyIn, resetsOn } from "@/modules/ia/month";
import {
  centsToMicro,
  costMicroBrl,
  DEFAULT_PRICES,
  estimateInputTokens,
  microToCentsCeil,
} from "@/modules/ia/pricing";

describe("EN-004 pricing", () => {
  const haiku = DEFAULT_PRICES["claude-haiku-5-5"] as (typeof DEFAULT_PRICES)[string];

  it("custo em micro-reais, arredondado para cima", () => {
    // 3000 in × 0,10 + 1500 out × 0,50 = US$ 0,00105 × 6 = R$ 0,0063 = 6300 micro
    expect(costMicroBrl({ inputTokens: 3000, outputTokens: 1500 }, haiku, 6)).toBe(6300n);
    expect(costMicroBrl({ inputTokens: 1, outputTokens: 0 }, haiku, 6)).toBe(1n); // ceil
    expect(costMicroBrl({ inputTokens: 0, outputTokens: 0 }, haiku, 6)).toBe(0n);
  });

  it("exibe em centavos para cima", () => {
    expect(microToCentsCeil(0n)).toBe(0);
    expect(microToCentsCeil(1n)).toBe(1);
    expect(microToCentsCeil(10_000n)).toBe(1);
    expect(microToCentsCeil(10_001n)).toBe(2);
    expect(microToCentsCeil(centsToMicro(240))).toBe(240);
  });

  it("estimateInputTokens = ceil((chars+bytes)/3)+50", () => {
    expect(estimateInputTokens(300, 600)).toBe(350);
    expect(estimateInputTokens(1, 1)).toBe(51);
  });
});

describe("EN-004 mês em São Paulo", () => {
  it("fronteiras de mês no fuso", () => {
    expect(monthKeyIn("America/Sao_Paulo", new Date("2026-11-30T23:30:00-03:00"))).toBe("2026-11");
    expect(aiMonthKey(new Date("2026-12-01T02:30:00Z"))).toBe("2026-11");
    expect(aiMonthKey(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12");
  });
  it("resetsOn é o 1º do mês seguinte", () => {
    expect(resetsOn("2026-11")).toBe("2026-12-01");
    expect(resetsOn("2026-12")).toBe("2027-01-01");
  });
});

describe("EN-004 boot (assertLlmConfig)", () => {
  const ok = { NODE_ENV: "development" };
  it("padrões: simulado, IA desligada, teto R$ 5,00", () => {
    const c = assertLlmConfig(ok);
    expect(c.LLM_PROVIDER).toBe("fake");
    expect(c.featuresEnabled).toBe(false);
    expect(c.LLM_MONTHLY_CAP_CENTS).toBe(500);
    expect(DEFAULT_MONTHLY_CAP_CENTS).toBe(500);
    expect(assertLlmConfig({ ...ok, LLM_MONTHLY_CAP_CENTS: "1200" }).LLM_MONTHLY_CAP_CENTS).toBe(
      1200,
    );
  });
  it("test/homolog com anthropic ⇒ throw", () => {
    const a = { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-x" };
    expect(() => assertLlmConfig({ ...a, NODE_ENV: "test" })).toThrow();
    expect(() =>
      assertLlmConfig({ ...a, NODE_ENV: "production", APP_HOMOLOG_MODE: "true" }),
    ).toThrow();
    expect(
      assertLlmConfig({ ...a, NODE_ENV: "production", APP_DEPLOY_ENV: "production" }).LLM_PROVIDER,
    ).toBe("anthropic");
  });
  it("anthropic sem chave ⇒ throw (e a mensagem não vaza a chave)", () => {
    expect(() => assertLlmConfig({ ...ok, LLM_PROVIDER: "anthropic" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
  it("produção com IA ligada e provedor simulado ⇒ throw; sem a flag, sobe", () => {
    const prod = { NODE_ENV: "production", APP_DEPLOY_ENV: "production" };
    expect(() => assertLlmConfig({ ...prod, AI_FEATURES_ENABLED: "true" })).toThrow();
    expect(assertLlmConfig(prod).featuresEnabled).toBe(false);
  });
  it("modelo sem preço ⇒ throw; LLM_PRICES_JSON resolve", () => {
    expect(() => assertLlmConfig({ ...ok, LLM_MODEL_ANALYSIS: "claude-novo" })).toThrow(
      /sem preço/,
    );
    const prices = JSON.stringify({ "claude-novo": { inUsdPerMTok: 1, outUsdPerMTok: 2 } });
    expect(
      assertLlmConfig({ ...ok, LLM_MODEL_ANALYSIS: "claude-novo", LLM_PRICES_JSON: prices }).prices[
        "claude-novo"
      ],
    ).toBeDefined();
  });
  it("valores vazios do .env equivalem a não definido", () => {
    expect(
      assertLlmConfig({ ...ok, ANTHROPIC_API_KEY: "", LLM_MONTHLY_CAP_CENTS: "" })
        .LLM_MONTHLY_CAP_CENTS,
    ).toBe(500);
  });
});
