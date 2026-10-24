import {
  createMcpHandler,
  isLegacyRequest,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Clock } from "@/lib/clock";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/modules/mcp/audit";
import {
  issuerOf,
  MAX_BODY_BYTES,
  mcpEnabled,
  prmUrl,
  RATE,
  WWW_AUTH_SCOPE,
} from "@/modules/mcp/config";
import { type McpContext, publicAuthMessage, resolveMcpContext } from "@/modules/mcp/context";
import { hit } from "@/modules/mcp/rate-limit";
import { type AnyTool, runTool, scopeAllows, scopeDeniedResult } from "@/modules/mcp/run-tool";

// SDD-024 §5.1 (+ §11): POST /api/mcp, stateless, nas duas eras do protocolo (2025-11-25 e 2026-07-28).
type Env = Record<string, string | undefined>;

export type McpDeps = {
  db: PrismaClient;
  clock: Clock;
  tools: AnyTool[];
  env?: Env;
};

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function rpcError(
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
) {
  return json(status, { jsonrpc: "2.0", error: { code, message }, id: null }, headers);
}

const wwwAuth = (env: Env, extra = "") =>
  `Bearer ${extra}resource_metadata="${prmUrl(env)}", scope="${WWW_AUTH_SCOPE}"`;

/** Lê o corpo com teto de bytes (64 KB), mesmo sem Content-Length. */
async function readBodyCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h ? /^Bearer\s+(\S+)$/i.exec(h) : null;
  return m?.[1] ?? null;
}

export async function handleMcp(req: Request, deps: McpDeps): Promise<Response> {
  const env = deps.env ?? process.env;
  if (!mcpEnabled(env)) return json(404, { error: "not_found" });
  if (req.method !== "POST") {
    return rpcError(405, -32000, "Method not allowed.", { allow: "POST" });
  }
  // Origin (MCP §Streamable HTTP): presente e diferente da origem canônica => 403
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== issuerOf(env)) return json(403, { error: "forbidden_origin" });

  const bearer = bearerOf(req);
  if (!bearer) {
    return json(401, { error: "unauthorized" }, { "www-authenticate": wwwAuth(env) });
  }
  const ctxOrErr = await resolveMcpContext(deps.db, bearer, deps.clock, env);
  if ("code" in ctxOrErr) {
    const desc = publicAuthMessage(ctxOrErr.description);
    return json(
      401,
      { error: "invalid_token", error_description: desc },
      { "www-authenticate": wwwAuth(env, `error="invalid_token", error_description="${desc}", `) },
    );
  }
  const ctx: McpContext = ctxOrErr;

  const text = await readBodyCapped(req);
  if (text === null) return rpcError(413, -32000, "Corpo da requisição grande demais.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return rpcError(400, -32700, "JSON inválido.");
  }
  if (Array.isArray(parsed)) return rpcError(400, -32600, "Lotes JSON-RPC não são suportados.");
  const msg = (parsed ?? {}) as { method?: unknown; params?: { name?: unknown } };
  const toolName =
    msg.method === "tools/call" && typeof msg.params?.name === "string" ? msg.params.name : null;
  const known = toolName ? deps.tools.find((t) => t.name === toolName) : undefined;

  // limites de transporte (fixos): por conexão, por minuto e por dia
  const now = deps.clock.now();
  const perMin = await hit(deps.db, `grant:${ctx.grantId}:min`, RATE.grantPerMin, 60, now);
  const perDay = perMin.ok
    ? await hit(deps.db, `grant:${ctx.grantId}:day`, RATE.grantPerDay, 86_400, now)
    : perMin;
  if (!perDay.ok) {
    await recordAudit(deps.db, {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      grantId: ctx.grantId,
      clientName: ctx.clientName,
      kind: "TOOL",
      tool: known?.name ?? null,
      outcome: "RATE_LIMITED",
      errorCode: "RATE_LIMITED",
      at: now,
    });
    return json(
      429,
      { error: "rate_limited", error_description: "limite de uso excedido" },
      { "retry-after": String(perDay.retryAfterS) },
    );
  }

  // Ferramenta existente, mas fora do escopo da conexão: erro legível + 403 insufficient_scope (step-up)
  if (known && !scopeAllows(ctx, known.scope)) {
    const www = wwwAuth(env, `error="insufficient_scope", `);
    await runTool(deps.db, ctx, known, {}, { wwwAuthenticateInsufficientScope: www });
    return json(
      403,
      {
        jsonrpc: "2.0",
        id: (parsed as { id?: unknown }).id ?? null,
        result: scopeDeniedResult(www),
      },
      { "www-authenticate": www },
    );
  }

  const www = wwwAuth(env, `error="insufficient_scope", `);
  const factory = () => {
    const server = new McpServer({ name: "financas-familia", version: "0.1.0" });
    for (const def of deps.tools) {
      if (!scopeAllows(ctx, def.scope)) continue; // tools/list só mostra o que a conexão pode chamar
      server.registerTool(
        def.name,
        {
          title: def.title,
          description: def.description,
          inputSchema: def.input,
          outputSchema: def.output,
          annotations: def.annotations,
        },
        async (args: unknown) =>
          (await runTool(deps.db, ctx, def, args, {
            wwwAuthenticateInsufficientScope: www,
          })) as never,
      );
    }
    return server;
  };

  // O corpo já foi lido: reconstrói a Request para o SDK (Accept sempre completo; o SDK exige os dois tipos).
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const forward = new Request(req.url, { method: "POST", headers, body: text });
  try {
    if (await isLegacyRequest(forward.clone())) {
      // Era 2025-11-25: sem sessão (sem Mcp-Session-Id) e respostas application/json
      const server = factory();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      return await transport.handleRequest(forward);
    }
    const modern = createMcpHandler(factory, { legacy: "reject", responseMode: "json" });
    return await modern.fetch(forward);
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : "erro" }, "mcp transport");
    return rpcError(500, -32603, "Erro interno.");
  }
}
