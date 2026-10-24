// SDD-021 §2 / ADR-028 §5: custo em micro-reais inteiros (BigInt). PURO: sem Next, Prisma nem relógio.

export type Price = { inUsdPerMTok: number; outUsdPerMTok: number };

/** US$ por milhão de tokens (tabela de 2026-10; revisar ao trocar de modelo). */
export const DEFAULT_PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { inUsdPerMTok: 0.1, outUsdPerMTok: 0.5 },
  "claude-sonnet-5-5": { inUsdPerMTok: 2.0, outUsdPerMTok: 10.0 },
};

const SCALE = 1_000_000n;

/** Converte um decimal (preço ou taxa) em inteiro na escala 1e6, sem erro de ponto flutuante visível. */
function scaled(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000));
}

/**
 * Custo em micro-reais, arredondado para cima:
 * tokens × (US$/MTok) × (R$/US$) = micro-R$ (o 1e6 de "por milhão" cancela o 1e6 de "micro").
 */
export function costMicroBrl(
  u: { inputTokens: number; outputTokens: number },
  p: Price,
  usdBrl: number,
): bigint {
  const rate = scaled(usdBrl);
  const inCost = BigInt(u.inputTokens) * scaled(p.inUsdPerMTok) * rate;
  const outCost = BigInt(u.outputTokens) * scaled(p.outUsdPerMTok) * rate;
  const total = inCost + outCost;
  const den = SCALE * SCALE;
  return (total + den - 1n) / den;
}

/** Estimativa local (sem `count_tokens`, que seria outro envio de dados): ceil((chars + bytes) / 3) + 50. */
export function estimateInputTokens(systemChars: number, inputBytes: number): number {
  return Math.ceil((systemChars + inputBytes) / 3) + 50;
}

/** Exibição em centavos, sempre para cima. */
export function microToCentsCeil(micro: bigint): number {
  const unit = 10_000n;
  return Number((micro + unit - 1n) / unit);
}

export function centsToMicro(cents: number): bigint {
  return BigInt(cents) * 10_000n;
}

/** Parse de `LLM_PRICES_JSON` (`{"modelo":{"inUsdPerMTok":n,"outUsdPerMTok":n}}`); inválido ⇒ throw. */
export function parsePricesJson(raw: string | undefined): Record<string, Price> {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("LLM_PRICES_JSON deve ser um objeto");
  }
  const out: Record<string, Price> = {};
  for (const [model, v] of Object.entries(parsed)) {
    const p = v as Partial<Price>;
    if (
      typeof p?.inUsdPerMTok !== "number" ||
      typeof p?.outUsdPerMTok !== "number" ||
      p.inUsdPerMTok < 0 ||
      p.outUsdPerMTok < 0
    ) {
      throw new Error(`LLM_PRICES_JSON: preço inválido para ${model}`);
    }
    out[model] = { inUsdPerMTok: p.inUsdPerMTok, outUsdPerMTok: p.outUsdPerMTok };
  }
  return out;
}
