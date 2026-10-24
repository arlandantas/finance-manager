import { describe, expect, it } from "vitest";
import {
  assertSafeAuthConfig,
  isDevLoginEnabled,
  isDevToolingEnabled,
  isHomologModeActive,
  isProdDeploy,
  unsafeProdVars,
} from "@/lib/auth/dev-login-guard";
import { checkHealth } from "@/modules/health/check-health";
import { assertLlmConfig } from "@/modules/ia/config";

// EN-007 / ADR-031 §4: matriz de ambiente com VERCEL_ENV.
const FORBIDDEN = ["AUTH_DEV_LOGIN", "APP_HOMOLOG_MODE", "APP_NOW_OVERRIDE"] as const;

describe("EN-007 isProdDeploy (matriz VERCEL_ENV x APP_DEPLOY_ENV)", () => {
  it.each([
    [{}, false],
    [{ VERCEL_ENV: "development" }, false],
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "preview" }, true],
    [{ APP_DEPLOY_ENV: "production" }, true],
    [{ APP_DEPLOY_ENV: "production", VERCEL_ENV: "development" }, true],
    [{ APP_DEPLOY_ENV: "staging" }, false],
  ])("%j => %s", (env, expected) => {
    expect(isProdDeploy(env)).toBe(expected);
  });
});

describe.each(["production", "preview"])(
  "EN-007 VERCEL_ENV=%s (login de teste recusado)",
  (vercelEnv) => {
    const base = { VERCEL_ENV: vercelEnv, NODE_ENV: "production" };

    it.each(FORBIDDEN)("presença de %s derruba o register() e o health", async (v) => {
      const env = { ...base, [v]: "" };
      expect(unsafeProdVars(env)).toEqual([v]);
      expect(() => assertSafeAuthConfig(env)).toThrow(/Configuração insegura/);
      const h = await checkHealth(
        async () => 1,
        () => new Date(0),
        env,
      );
      expect(h.status).toBe("unsafe_config");
    });

    it("login de teste, ferramentas de dev e homologação ficam desligados mesmo com as flags", () => {
      const env = { ...base, AUTH_DEV_LOGIN: "true", APP_HOMOLOG_MODE: "true" };
      expect(isDevLoginEnabled(env)).toBe(false);
      expect(isDevToolingEnabled(env)).toBe(false);
      expect(isHomologModeActive(env)).toBe(false);
    });

    it("sem variáveis proibidas sobe normalmente", () => {
      expect(() => assertSafeAuthConfig(base)).not.toThrow();
    });
  },
);

describe("EN-007 assertLlmConfig usa isProdDeploy", () => {
  it("VERCEL_ENV=production com IA ligada e provedor fake falha (falha fechada)", () => {
    expect(() =>
      assertLlmConfig({
        VERCEL_ENV: "production",
        AI_FEATURES_ENABLED: "true",
        LLM_PROVIDER: "fake",
      }),
    ).toThrow(/exige LLM_PROVIDER=anthropic/);
  });

  it("em dev (sem Vercel) o provedor fake com IA ligada continua válido", () => {
    expect(
      assertLlmConfig({ AI_FEATURES_ENABLED: "true", LLM_PROVIDER: "fake" }).featuresEnabled,
    ).toBe(true);
  });
});
