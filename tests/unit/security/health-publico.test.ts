import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/health/repo", () => ({ pingDatabase: async () => 1 }));

const SECRET = "segredo-de-cron-com-16+";

async function get(headers: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET(new Request("http://localhost:3100/api/health", { headers }));
  return { status: res.status, body: await res.json() };
}

afterEach(() => vi.unstubAllEnvs());

describe("SEC-022 /api/health público não revela unsafe_config", () => {
  it("anônimo vê degraded (503); com Bearer do cron vê unsafe_config", async () => {
    vi.stubEnv("APP_DEPLOY_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    vi.stubEnv("CRON_SECRET", SECRET);
    const anon = await get();
    expect(anon.status).toBe(503);
    expect(anon.body.status).toBe("degraded");
    expect(JSON.stringify(anon.body)).not.toContain("unsafe");
    // SEC-028/022: nem o detalhe do banco ("up" + degraded delataria a configuração insegura)
    expect(anon.body.checks).toBeUndefined();
    expect(Object.keys(anon.body).sort()).toEqual(["status", "timestamp"]);
    const wrong = await get({ authorization: "Bearer errado-errado-errado" });
    expect(wrong.body.status).toBe("degraded");
    expect(wrong.body.checks).toBeUndefined();
    const priv = await get({ authorization: `Bearer ${SECRET}` });
    expect(priv.body.status).toBe("unsafe_config");
    expect(priv.body.checks).toEqual({ database: "up" });
  });

  it("configuração segura: ok (200) para todos", async () => {
    vi.stubEnv("AUTH_DEV_LOGIN", "");
    vi.stubEnv("APP_HOMOLOG_MODE", "");
    vi.stubEnv("APP_NOW_OVERRIDE", "");
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
  });
});
