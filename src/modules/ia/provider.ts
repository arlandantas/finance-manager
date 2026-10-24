import { AnthropicLlmAdapter } from "@/modules/ia/anthropic-adapter";
import { getLlmConfig } from "@/modules/ia/config";
import { type FakeFixtures, FakeLlmAdapter } from "@/modules/ia/fake-adapter";
import type { LlmPort } from "@/modules/ia/port";

// Seleção do provedor por configuração (ADR-028 §3). Singleton por processo, em `globalThis` para ser
// compartilhado entre os bundles de rota do Next dev (a rota de cenário e a de uso enxergam o mesmo fake).
const KEY = "__fmLlmPort";
type G = typeof globalThis & { [KEY]?: LlmPort };

export function getLlmPort(): LlmPort {
  const g = globalThis as G;
  if (g[KEY]) return g[KEY];
  const cfg = getLlmConfig();
  g[KEY] =
    cfg.LLM_PROVIDER === "anthropic"
      ? new AnthropicLlmAdapter({
          apiKey: cfg.ANTHROPIC_API_KEY as string,
          timeoutMs: cfg.LLM_TIMEOUT_MS,
          maxRetries: cfg.LLM_MAX_RETRIES,
        })
      : new FakeLlmAdapter();
  return g[KEY];
}

/** O fake em uso, ou `null` com o provedor real. */
export function getFakeAdapter(): FakeLlmAdapter | null {
  const port = getLlmPort();
  return port instanceof FakeLlmAdapter ? port : null;
}

/** As histórias registram as fixtures das suas finalidades no provedor simulado. */
export function registerFakeFixtures(fixtures: FakeFixtures): void {
  const fake = getFakeAdapter();
  if (fake) fake.fixtures = { ...fake.fixtures, ...fixtures };
}

export function resetLlmPortForTests(): void {
  delete (globalThis as G)[KEY];
}
