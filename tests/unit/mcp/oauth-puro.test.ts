import { createHash } from "node:crypto";
// @ts-expect-error o Next não publica tipos do path-to-regexp compilado
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { getEnv } from "@/lib/env";
import { LOG_REDACT_PATHS } from "@/lib/logger";
import { AUDIT_PARAM_KEYS, sanitizeAuditParams } from "@/modules/mcp/audit";
import { assertCimdUrl, CimdError, fetchCimd, sanitizeClientName } from "@/modules/mcp/cimd";
import {
  canonicalResource,
  cimdAllowedHosts,
  issuerOf,
  mcpEnabled,
  prmUrl,
} from "@/modules/mcp/config";
import { authorizationServerMetadata, protectedResourceMetadata } from "@/modules/mcp/metadata";
import { isAcceptableRedirectUri, redirectUriMatches } from "@/modules/mcp/redirect";
import { hashToken, newTokenValue, pkceS256 } from "@/modules/mcp/tokens";
import { config as proxyConfig } from "@/proxy";

describe("EN-006a redirect_uri (SDD-024 §4.9)", () => {
  it.each([
    [
      "R1 igual",
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback",
      true,
    ],
    [
      "R2 barra final",
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback/",
      false,
    ],
    [
      "R3 loopback ignora a porta",
      "http://localhost/callback",
      "http://localhost:3118/callback",
      true,
    ],
    [
      "R4 127.0.0.1 x localhost",
      "http://127.0.0.1/callback",
      "http://localhost:3118/callback",
      false,
    ],
    [
      "R5 id diferente",
      "https://chatgpt.com/connector/oauth/abc",
      "https://chatgpt.com/connector/oauth/abd",
      false,
    ],
    [
      "caminho diferente no loopback",
      "http://localhost/callback",
      "http://localhost:1/outro",
      false,
    ],
    ["https nunca ignora porta", "https://claude.ai/cb", "https://claude.ai:8443/cb", false],
    ["esquema diferente", "https://localhost/cb", "http://localhost/cb", false],
    ["lixo", "nao-e-url", "nao-e-url2", false],
  ])("%s", (_n, registered, presented, expected) => {
    expect(redirectUriMatches(registered, presented)).toBe(expected);
  });

  it("R6: http em host público não é aceitável para registro", () => {
    expect(isAcceptableRedirectUri("http://evil.com/callback")).toBe(false);
    expect(isAcceptableRedirectUri("https://claude.ai/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://localhost:1234/cb")).toBe(true);
    expect(isAcceptableRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
  });
});

describe("EN-006a CIMD / SSRF (fetch injetado, sem rede)", () => {
  const URL_OK = "https://claude.ai/oauth/client.json";
  const doc = {
    client_id: URL_OK,
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    token_endpoint_auth_method: "none",
  };
  const ok = (body: unknown = doc, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });

  it("documento válido", async () => {
    const c = await fetchCimd(URL_OK, ["claude.ai"], async () => ok());
    expect(c).toMatchObject({
      clientId: URL_OK,
      clientName: "Claude",
      redirectUris: doc.redirect_uris,
    });
  });

  it("host fora da lista, http, porta, credenciais e caminho vazio: recusa SEM chamar fetch", async () => {
    let calls = 0;
    const f = async () => {
      calls++;
      return ok();
    };
    for (const u of [
      "https://evil.example/client.json",
      "http://claude.ai/client.json",
      "https://claude.ai:8443/client.json",
      "https://user:pw@claude.ai/client.json",
      "https://claude.ai/",
      "https://claude.ai.evil.example/client.json",
      "https://169.254.169.254/latest/meta-data",
      "ftp://claude.ai/x",
      "nao-url",
    ]) {
      await expect(fetchCimd(u, ["claude.ai"], f)).rejects.toBeInstanceOf(CimdError);
    }
    expect(calls).toBe(0);
    expect(() => assertCimdUrl(URL_OK, ["claude.ai"])).not.toThrow();
  });

  it("redirecionamento 3xx, status != 200, content-type errado, corpo > 5 KB, JSON/esquema inválido", async () => {
    const cases: Array<[string, () => Response | Promise<Response>]> = [
      [
        "3xx",
        () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
      ],
      ["404", () => new Response("x", { status: 404 })],
      [
        "content-type",
        () => new Response(JSON.stringify(doc), { headers: { "content-type": "text/html" } }),
      ],
      ["6 KB", () => ok({ ...doc, client_name: "a".repeat(6000) })],
      ["json", () => new Response("{nao", { headers: { "content-type": "application/json" } })],
      ["schema", () => ok({ client_id: URL_OK })],
      ["client_id diferente", () => ok({ ...doc, client_id: "https://claude.ai/outro.json" })],
      ["private_key_jwt", () => ok({ ...doc, token_endpoint_auth_method: "private_key_jwt" })],
      ["redirect http público", () => ok({ ...doc, redirect_uris: ["http://evil.com/cb"] })],
    ];
    for (const [name, make] of cases) {
      await expect(
        fetchCimd(URL_OK, ["claude.ai"], async () => make()),
        name,
      ).rejects.toBeInstanceOf(CimdError);
    }
  });

  it("falha de rede e timeout viram CimdError e a chamada leva redirect manual + sinal de timeout", async () => {
    let init: RequestInit | undefined;
    await expect(
      fetchCimd(URL_OK, ["claude.ai"], async (_u, i) => {
        init = i;
        throw new Error("timeout");
      }),
    ).rejects.toBeInstanceOf(CimdError);
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("nome do cliente é saneado (NFKC, controles e direção removidos, ≤ 80)", () => {
    expect(sanitizeClientName("  Claude‮\u0007  ​App ")).toBe("Claude App");
    expect(sanitizeClientName("ＣＬＡＵＤＥ")).toBe("CLAUDE");
    expect(sanitizeClientName("x".repeat(200))).toHaveLength(80);
    expect(sanitizeClientName("")).toBe("Assistente sem nome");
    expect(sanitizeClientName(undefined)).toBe("Assistente sem nome");
  });
});

describe("EN-006a tokens e PKCE", () => {
  it("S256 confere com o vetor do RFC 7636", () => {
    expect(pkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
  it("valores com prefixo e só o SHA-256 é derivado", () => {
    for (const [kind, prefix] of [
      ["CODE", "fmc_"],
      ["ACCESS", "fma_"],
      ["REFRESH", "fmr_"],
    ] as const) {
      const t = newTokenValue(kind);
      expect(t.value.startsWith(prefix)).toBe(true);
      expect(t.value.length).toBeGreaterThan(40);
      expect(t.hash).toBe(createHash("sha256").update(t.value).digest("hex"));
      expect(hashToken(t.value)).toBe(t.hash);
      expect(newTokenValue(kind).value).not.toBe(t.value);
    }
  });
});

describe("EN-006a configuração e metadados", () => {
  const env = { APP_URL: "https://verbus-finance.vercel.app/", MCP_ENABLED: "true" };
  it("resource, issuer e PRM canônicos", () => {
    expect(issuerOf(env)).toBe("https://verbus-finance.vercel.app");
    expect(canonicalResource(env)).toBe("https://verbus-finance.vercel.app/api/mcp");
    expect(prmUrl(env)).toBe(
      "https://verbus-finance.vercel.app/.well-known/oauth-protected-resource/api/mcp",
    );
    expect(protectedResourceMetadata(env).resource).toBe(canonicalResource(env));
    expect(authorizationServerMetadata(env).issuer).toBe(issuerOf(env));
  });
  it("flag: desligada por padrão; preview da Vercel sempre desliga", () => {
    expect(mcpEnabled({})).toBe(false);
    expect(mcpEnabled({ MCP_ENABLED: "false" })).toBe(false);
    expect(mcpEnabled({ MCP_ENABLED: "true" })).toBe(true);
    expect(mcpEnabled({ MCP_ENABLED: "true", VERCEL_ENV: "preview" })).toBe(false);
    expect(mcpEnabled({ MCP_ENABLED: "true", VERCEL_ENV: "production" })).toBe(true);
  });
  it("hosts do CIMD: padrão claude.ai", () => {
    expect(cimdAllowedHosts({})).toEqual(["claude.ai"]);
    expect(cimdAllowedHosts({ MCP_CIMD_ALLOWED_HOSTS: "Claude.ai, chatgpt.com" })).toEqual([
      "claude.ai",
      "chatgpt.com",
    ]);
  });
  it("produção com MCP_ENABLED e APP_URL http => o boot falha (matriz)", () => {
    const base = { DATABASE_URL: "postgresql://x", AUTH_SECRET: "s", NODE_ENV: "production" };
    expect(() => getEnv({ ...base, MCP_ENABLED: "true", APP_URL: "http://x.test" })).toThrow(
      /APP_URL/,
    );
    expect(() => getEnv({ ...base, MCP_ENABLED: "true", APP_URL: "https://x.test" })).not.toThrow();
    expect(() => getEnv({ ...base, APP_URL: "http://x.test" })).not.toThrow();
    expect(() =>
      getEnv({ ...base, NODE_ENV: "development", MCP_ENABLED: "true", APP_URL: "http://x.test" }),
    ).not.toThrow();
  });
});

describe("EN-006b auditoria: allowlist de parâmetros", () => {
  it("descarta chaves fora da allowlist e valores não escalares", () => {
    const out = sanitizeAuditParams({
      q: "mercado",
      description: "texto livre",
      limit: 5,
      period: "2026-10",
      accountIds: ["a", "b"],
      nested: { x: 1 },
      page: { cursor: "x" },
    });
    expect(Object.keys(out).sort()).toEqual(["accountIds", "limit", "period"]);
  });
  it("a allowlist não contém campos de texto livre", () => {
    for (const k of ["q", "description", "note", "amount", "amountInCents", "name"]) {
      expect(AUDIT_PARAM_KEYS as readonly string[]).not.toContain(k);
    }
  });
  it("valores longos são truncados", () => {
    const out = sanitizeAuditParams({ period: "x".repeat(500) });
    expect((out.period as string).length).toBe(100);
  });
});

describe("EN-006 logs: credenciais mascaradas (SDD-024 §8)", () => {
  it("Authorization, access_token, refresh_token, code e code_verifier => [REDACTED]", () => {
    const lines: string[] = [];
    const log = pino({ redact: LOG_REDACT_PATHS }, { write: (l: string) => void lines.push(l) });
    log.info({
      authorization: "Bearer fma_segredo",
      headers: { authorization: "Bearer fma_segredo2" },
      req: { headers: { authorization: "Bearer fma_segredo3", cookie: "authjs=x" } },
      body: {
        access_token: "fma_a",
        refresh_token: "fmr_b",
        code: "fmc_c",
        code_verifier: "valorsecreto1",
      },
      access_token: "fma_d",
      refresh_token: "fmr_e",
      code: "fmc_f",
      code_verifier: "valorsecreto2",
    });
    const out = lines.join("");
    for (const secret of ["fma_", "fmr_", "fmc_", "valorsecreto", "segredo", "authjs=x"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[Redacted]");
  });
});

describe("EN-006 proxy: matcher (SDD-024 §8)", () => {
  const re = pathToRegexp(proxyConfig.matcher[0] as string);
  it.each([
    ["/.well-known/oauth-protected-resource/api/mcp", false],
    ["/.well-known/oauth-protected-resource", false],
    ["/.well-known/oauth-authorization-server", false],
    ["/api/oauth/token", false],
    ["/api/mcp", false],
    ["/api/cron/purge", false],
    ["/oauth/authorize", false],
    ["/oauth/consent", true],
    ["/contas", true],
    ["/", true],
    ["/login", false],
    ["/convites", true],
    ["/convite/abc123", false],
  ])("%s intercepta=%s", (path, intercepted) => {
    expect(re.test(path)).toBe(intercepted);
  });
});
