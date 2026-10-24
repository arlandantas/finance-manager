import { z } from "zod";
import { isProdDeploy } from "@/lib/auth/dev-login-guard";
import { DEFAULT_PRICES, type Price, parsePricesJson } from "@/modules/ia/pricing";

// SDD-021 §2 / ADR-028 §3: configuração do LLM, lida uma vez do ambiente do servidor.
// Teto inicial R$ 5,00 por família/mês (D-GES-32, TL-27): padrão 500 centavos, configurável.
export const DEFAULT_MONTHLY_CAP_CENTS = 500;

export const LlmEnvSchema = z.object({
  LLM_PROVIDER: z.enum(["fake", "anthropic"]).default("fake"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_FEATURES_ENABLED: z.enum(["true", "false"]).default("false"),
  LLM_MODEL_ANALYSIS: z.string().min(1).default("claude-haiku-5-5"),
  LLM_EFFORT_ANALYSIS: z.enum(["low", "medium", "high"]).default("low"),
  LLM_MAX_OUTPUT_TOKENS_ANALYSIS: z.coerce.number().int().min(256).max(8000).default(3000),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LLM_DEADLINE_MS: z.coerce.number().int().min(1000).max(180000).default(60000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  LLM_USD_BRL_RATE: z.coerce.number().positive().default(6),
  LLM_MONTHLY_CAP_CENTS: z.coerce.number().int().min(0).default(DEFAULT_MONTHLY_CAP_CENTS),
  LLM_PRICES_JSON: z.string().optional(),
});

export type LlmConfig = z.infer<typeof LlmEnvSchema> & {
  prices: Record<string, Price>;
  featuresEnabled: boolean;
};

type Env = Record<string, string | undefined>;

/** Variáveis vazias (`FOO=""` no .env) equivalem a "não definido". */
function clean(env: Env): Env {
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
}

/** Lê e valida o ambiente; aplica as regras de boot (SDD-021 §2). Lança `Error` sem vazar valores. */
export function assertLlmConfig(source: Env = process.env): LlmConfig {
  const env = clean(source);
  const parsed = LlmEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Configuração de LLM inválida: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  const cfg = parsed.data;
  const isTest = env.NODE_ENV === "test" || env.APP_HOMOLOG_MODE?.toLowerCase() === "true";
  const isProd = isProdDeploy(env);
  const featuresEnabled = cfg.AI_FEATURES_ENABLED === "true";
  if (isTest && cfg.LLM_PROVIDER === "anthropic") {
    throw new Error(
      "LLM_PROVIDER=anthropic é proibido em teste e homologação (usa o provedor simulado)",
    );
  }
  if (cfg.LLM_PROVIDER === "anthropic" && !cfg.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY é obrigatória com LLM_PROVIDER=anthropic");
  }
  if (isProd && featuresEnabled && cfg.LLM_PROVIDER === "fake") {
    throw new Error("Em produção, AI_FEATURES_ENABLED=true exige LLM_PROVIDER=anthropic");
  }
  let custom: Record<string, Price>;
  try {
    custom = parsePricesJson(cfg.LLM_PRICES_JSON);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "LLM_PRICES_JSON inválido");
  }
  const prices = { ...DEFAULT_PRICES, ...custom };
  if (!prices[cfg.LLM_MODEL_ANALYSIS]) {
    throw new Error(
      `Modelo sem preço conhecido: ${cfg.LLM_MODEL_ANALYSIS} (defina LLM_PRICES_JSON)`,
    );
  }
  return { ...cfg, prices, featuresEnabled };
}

let cached: LlmConfig | undefined;

/** Config do processo (lida uma vez). Em testes, use `resetLlmConfigForTests`. */
export function getLlmConfig(): LlmConfig {
  cached ??= assertLlmConfig(process.env);
  return cached;
}

export function resetLlmConfigForTests(): void {
  cached = undefined;
}
