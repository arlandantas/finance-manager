import { createHash } from "node:crypto";
// @ts-expect-error o Next não publica tipos do path-to-regexp compilado
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/lib/env";
import { LOG_REDACT_PATHS } from "@/lib/logger";
import { AUDIT_PARAM_KEYS, sanitizeAuditParams } from "@/modules/mcp/audit";
import {
  assertCimdUrl,
  CimdError,
  fetchCimd,
  isCimdRedirectUri,
  sanitizeClientName,
  setCimdDnsLookup,
} from "@/modules/mcp/cimd";
import {
  canonicalResource,
  cimdAllowAny,
  cimdAllowedClientIds,
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

describe("EN-006a/SEC-010 CIMD por URL exata e SSRF (fetch e DNS injetados, sem rede)", () => {
  const URL_OK = "https://claude.ai/oauth/client.json";
  const ALLOW = [URL_OK];
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
  const reason = async (p: Promise<unknown> | (() => unknown)) => {
    try {
      await (typeof p === "function" ? p() : p);
    } catch (e) {
      return (e as CimdError).reason;
    }
    return "ok";
  };
  beforeEach(() => setCimdDnsLookup(async () => [{ address: "160.79.104.10" }]));
  afterEach(() => setCimdDnsLookup(null));

  it("documento válido", async () => {
    const c = await fetchCimd(URL_OK, ALLOW, async () => ok());
    expect(c).toMatchObject({
      clientId: URL_OK,
      clientName: "Claude",
      redirectUris: doc.redirect_uris,
    });
  });

  it("reprodução do relatório: qualquer outro caminho em claude.ai deixa de valer (not_allowed)", async () => {
    expect(await reason(() => assertCimdUrl("https://claude.ai/qualquer/caminho", ALLOW))).toBe(
      "not_allowed",
    );
  });

  it("assertCimdUrl: aceita a URL exata e recusa variações, SEM chamar fetch", async () => {
    expect(() => assertCimdUrl(URL_OK, ALLOW)).not.toThrow();
    let calls = 0;
    const f = async () => {
      calls++;
      return ok();
    };
    const cases: Array<[string, string]> = [
      ["https://claude.ai/x?y=1", "url"],
      ["https://CLAUDE.ai/oauth/client.json", "not_canonical"],
      ["https://claude.ai/a/../b", "not_canonical"],
      ["https://claude.ai/%2e%2e/x", "not_canonical"],
      ["https://claude.ai:443/oauth/client.json", "not_canonical"],
      ["https://127.0.0.1/oauth/client.json", "ip_host"],
      ["https://[::1]/x", "ip_host"],
      ["https://claude.ai./oauth/client.json", "ip_host"],
      [`https://claude.ai/${"a".repeat(513)}`, "url"],
      ["http://claude.ai/oauth/client.json", "scheme"],
      ["https://user:pw@claude.ai/oauth/client.json", "url"],
      ["https://claude.ai/oauth/client.json#f", "url"],
      ["https://claude.ai.evil.example/oauth/client.json", "not_allowed"],
      ["ftp://claude.ai/x", "scheme"],
      ["nao-url", "url"],
    ];
    for (const [u, why] of cases) expect(await reason(fetchCimd(u, ALLOW, f)), u).toBe(why);
    expect(calls).toBe(0);
  });

  it("lista vazia: nenhum cliente CIMD é aceito", async () => {
    expect(await reason(() => assertCimdUrl(URL_OK, []))).toBe("not_allowed");
  });

  it('modo "any" (MCP_CIMD_ALLOW_ANY): aceita URL fora da lista, mas mantém as demais validações', async () => {
    expect(() => assertCimdUrl(URL_OK, "any")).not.toThrow();
    expect(await reason(() => assertCimdUrl("http://claude.ai/x", "any"))).toBe("scheme");
    expect(await reason(() => assertCimdUrl("https://127.0.0.1/x", "any"))).toBe("ip_host");
    expect(await reason(() => assertCimdUrl("https://claude.ai/x?y=1", "any"))).toBe("url");
  });

  it("cimdAllowAny: só com MCP_CIMD_ALLOW_ANY=true (padrão desligado)", () => {
    expect(cimdAllowAny({})).toBe(false);
    expect(cimdAllowAny({ MCP_CIMD_ALLOW_ANY: "false" })).toBe(false);
    expect(cimdAllowAny({ MCP_CIMD_ALLOW_ANY: " TRUE " })).toBe(true);
  });

  it("falhas de busca: 3xx, status, content-type, tamanho, JSON, esquema, client_id, método, redirect_uris", async () => {
    const cases: Array<[string, string, () => Response | Promise<Response>]> = [
      [
        "redirect",
        "3xx",
        () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
      ],
      ["status", "404", () => new Response("x", { status: 404 })],
      [
        "content-type",
        "text/html",
        () => new Response(JSON.stringify(doc), { headers: { "content-type": "text/html" } }),
      ],
      ["size", "6 KB", () => ok({ ...doc, client_name: "a".repeat(6000) })],
      [
        "json",
        "json",
        () => new Response("{nao", { headers: { "content-type": "application/json" } }),
      ],
      ["schema", "schema", () => ok({ client_id: URL_OK })],
      [
        "client_id",
        "client_id diferente",
        () => ok({ ...doc, client_id: "https://claude.ai/outro.json" }),
      ],
      [
        "auth_method",
        "private_key_jwt",
        () => ok({ ...doc, token_endpoint_auth_method: "private_key_jwt" }),
      ],
      [
        "redirect_uris",
        "outro host",
        () => ok({ ...doc, redirect_uris: ["https://evil.example/cb"] }),
      ],
      [
        "redirect_uris",
        "loopback",
        () => ok({ ...doc, redirect_uris: ["http://127.0.0.1:5000/cb"] }),
      ],
      ["redirect_uris", "http", () => ok({ ...doc, redirect_uris: ["http://claude.ai/cb"] })],
    ];
    for (const [why, name, make] of cases) {
      expect(await reason(fetchCimd(URL_OK, ALLOW, async () => make())), name).toBe(why);
    }
  });

  it("corpo de 6 KB em chunks sem content-length => size e o leitor é cancelado", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(1024).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    const res = new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    expect(await reason(fetchCimd(URL_OK, ALLOW, async () => res))).toBe("size");
    expect(cancelled).toBe(true);
  });

  it("content-length mentindo (10) com corpo de 6 KB => size", async () => {
    const body = JSON.stringify({ ...doc, client_name: "a".repeat(6000) });
    const res = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json", "content-length": "10" },
    });
    expect(await reason(fetchCimd(URL_OK, ALLOW, async () => res))).toBe("size");
  });

  it("content-type com charset é aceito (tipo base application/json)", async () => {
    const res = new Response(JSON.stringify(doc), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    await expect(fetchCimd(URL_OK, ALLOW, async () => res)).resolves.toBeTruthy();
  });

  it("DNS resolvendo para endereço privado/loopback/link-local => ssrf, sem chamar fetch", async () => {
    let calls = 0;
    for (const addr of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "172.16.0.9",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      setCimdDnsLookup(async () => [{ address: addr }]);
      expect(
        await reason(
          fetchCimd(URL_OK, ALLOW, async () => {
            calls++;
            return ok();
          }),
        ),
        addr,
      ).toBe("ssrf");
    }
    expect(calls).toBe(0);
  });

  it("atraso acima de 5 s => fetch (timeout cobre o pedido)", async () => {
    const f = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        if (init.signal?.aborted) rej(new Error("abort"));
        init.signal?.addEventListener("abort", () => rej(new Error("abort")));
      });
    // o relógio interno de AbortSignal.timeout não é simulável: força o sinal já disparado
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    try {
      expect(await reason(fetchCimd(URL_OK, ALLOW, f))).toBe("fetch");
      expect(spy).toHaveBeenCalledWith(5000);
    } finally {
      spy.mockRestore();
    }
  });

  it("falha de rede vira CimdError e a chamada leva redirect manual + sinal de timeout", async () => {
    let init: RequestInit | undefined;
    await expect(
      fetchCimd(URL_OK, ALLOW, async (_u, i) => {
        init = i;
        throw new Error("falhou");
      }),
    ).rejects.toBeInstanceOf(CimdError);
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("isCimdRedirectUri: https no mesmo host; recusa outro host, loopback, credenciais, fragmento", () => {
    expect(isCimdRedirectUri("https://claude.ai/api/mcp/auth_callback", "claude.ai")).toBe(true);
    expect(isCimdRedirectUri("https://evil.example/cb", "claude.ai")).toBe(false);
    expect(isCimdRedirectUri("http://localhost/callback", "claude.ai")).toBe(false);
    expect(isCimdRedirectUri("https://u:p@claude.ai/cb", "claude.ai")).toBe(false);
    expect(isCimdRedirectUri("https://claude.ai/cb#x", "claude.ai")).toBe(false);
  });

  it("lista de URLs permitidas vem de MCP_CIMD_ALLOWED_CLIENT_IDS (vazia por padrão)", () => {
    expect(cimdAllowedClientIds({})).toEqual([]);
    expect(
      cimdAllowedClientIds({
        MCP_CIMD_ALLOWED_CLIENT_IDS: " https://a.test/x.json , https://b.test/y.json ",
      }),
    ).toEqual(["https://a.test/x.json", "https://b.test/y.json"]);
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
