/**
 * Smoke do MCP (SDD-024 §8c/§9.3): `pnpm mcp:smoke https://verbus-finance.vercel.app`.
 * Só GET/POST sem credencial e sem dados: confere 401 com `resource_metadata`, os metadados OAuth e `GET /api/mcp` 405.
 * Nunca autentica. Rodado manualmente pelo usuário/Gestor contra a URL pública depois do deploy.
 */
export type SmokeResult = { ok: boolean; lines: string[] };

export async function smoke(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SmokeResult> {
  const base = baseUrl.replace(/\/+$/, "");
  const lines: string[] = [];
  let ok = true;
  const check = (cond: boolean, okMsg: string, badMsg: string) => {
    lines.push(`${cond ? "OK  " : "FALHA"} ${cond ? okMsg : badMsg}`);
    if (!cond) ok = false;
  };

  const unauth = await fetchImpl(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const www = unauth.headers.get("www-authenticate") ?? "";
  check(
    unauth.status === 401,
    "POST /api/mcp sem credencial => 401",
    `POST /api/mcp respondeu ${unauth.status}`,
  );
  check(
    www.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`),
    "WWW-Authenticate traz resource_metadata",
    `WWW-Authenticate inesperado: ${www}`,
  );

  const get = await fetchImpl(`${base}/api/mcp`);
  check(get.status === 405, "GET /api/mcp => 405", `GET /api/mcp respondeu ${get.status}`);

  const prm = await fetchImpl(`${base}/.well-known/oauth-protected-resource/api/mcp`);
  const prmBody = prm.ok ? ((await prm.json()) as Record<string, unknown>) : {};
  check(prm.status === 200, "PRM 200", `PRM respondeu ${prm.status}`);
  check(
    prmBody.resource === `${base}/api/mcp`,
    "PRM.resource canônico",
    `PRM.resource = ${String(prmBody.resource)}`,
  );

  const as = await fetchImpl(`${base}/.well-known/oauth-authorization-server`);
  const asBody = as.ok ? ((await as.json()) as Record<string, unknown>) : {};
  check(as.status === 200, "metadados do AS 200", `AS respondeu ${as.status}`);
  check(asBody.issuer === base, "issuer = origem pública", `issuer = ${String(asBody.issuer)}`);
  check(
    Array.isArray(asBody.code_challenge_methods_supported) &&
      (asBody.code_challenge_methods_supported as string[]).join() === "S256",
    "PKCE S256 anunciado",
    "code_challenge_methods_supported inesperado",
  );
  check(
    asBody.client_id_metadata_document_supported === true,
    "CIMD anunciado",
    "client_id_metadata_document_supported ausente",
  );
  lines.push(ok ? "SMOKE MCP OK" : "SMOKE MCP FALHOU");
  return { ok, lines };
}

if (process.argv[1]?.endsWith("mcp-smoke.ts")) {
  const url = process.argv[2] ?? process.env.MCP_TEST_URL;
  if (!url) {
    console.error("uso: pnpm mcp:smoke <url-publica>");
    process.exit(2);
  }
  smoke(url)
    .then((r) => {
      for (const l of r.lines) console.log(l);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
