import { describe, expect, it } from "vitest";
import { checkHealth } from "@/modules/health/check-health";

const fixed = () => new Date("2026-01-01T00:00:00Z");

describe("checkHealth", () => {
  it("retorna ok quando o banco responde", async () => {
    const r = await checkHealth(async () => 1, fixed);
    expect(r).toEqual({
      status: "ok",
      checks: { database: "up" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  it("retorna degraded quando o banco falha", async () => {
    const r = await checkHealth(async () => {
      throw new Error("boom");
    }, fixed);
    expect(r.status).toBe("degraded");
    expect(r.checks.database).toBe("down");
  });

  it("responde unsafe_config em produção com variável de teste presente (ADR-026 §5)", async () => {
    for (const v of ["AUTH_DEV_LOGIN", "APP_HOMOLOG_MODE", "APP_NOW_OVERRIDE"]) {
      const r = await checkHealth(async () => 1, fixed, { APP_DEPLOY_ENV: "production", [v]: "" });
      expect(r.status).toBe("unsafe_config");
    }
  });

  it("fora de produção a presença dessas variáveis não afeta o health", async () => {
    const r = await checkHealth(async () => 1, fixed, { AUTH_DEV_LOGIN: "true" });
    expect(r.status).toBe("ok");
  });
});
