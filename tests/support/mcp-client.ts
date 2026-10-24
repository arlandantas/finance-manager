import { createHash, randomBytes } from "node:crypto";
import { vi } from "vitest";
import { GET as asMetadataGET } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as prmMcpGET } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as prmGET } from "@/app/.well-known/oauth-protected-resource/route";
import { POST as mcpPOST } from "@/app/api/mcp/route";
import { POST as decisionPOST } from "@/app/api/oauth/authorize/decision/route";
import { POST as revokePOST } from "@/app/api/oauth/revoke/route";
import { POST as tokenPOST } from "@/app/api/oauth/token/route";
import { GET as authorizeGET } from "@/app/oauth/authorize/route";
import type { Caller } from "./call";

// SDD-024 §8: cliente MCP de TESTE. Roda o fluxo OAuth inteiro EM PROCESSO (Route Handlers reais, `Request`
// reais), sem LLM e sem rede: o "assistente" é o próprio teste. O documento CIMD é servido por um `fetch`
// falso que só conhece a URL do cliente de teste.
export const ORIGIN = "http://localhost:3100";
export const RESOURCE = `${ORIGIN}/api/mcp`;
export const CIMD_URL = "https://claude.ai/test-client.json";
export const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

export function useMcpEnv() {
  process.env.MCP_ENABLED = "true";
  process.env.MCP_CIMD_ALLOWED_HOSTS = "claude.ai";
  process.env.APP_URL = ORIGIN;
  delete process.env.VERCEL_ENV;
}

/** Substitui o `fetch` global: só o CIMD do cliente de teste responde; qualquer outra URL falha (sem rede). */
export function stubCimd(
  doc: Record<string, unknown> | ((url: string) => Response | Promise<Response>) = {},
) {
  const calls: string[] = [];
  const fake = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    if (typeof doc === "function") return doc(url);
    if (url !== CIMD_URL) throw new Error(`fetch externo bloqueado no teste: ${url}`);
    return new Response(
      JSON.stringify({
        client_id: CIMD_URL,
        client_name: "Claude (teste)",
        redirect_uris: [REDIRECT_URI, "http://localhost/callback"],
        token_endpoint_auth_method: "none",
        ...doc,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  vi.stubGlobal("fetch", fake);
  return { calls };
}

export const b64url = (b: Buffer) => b.toString("base64url");
export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export type DanceOptions = {
  member: Caller;
  scopes?: string[];
  validityDays?: 30 | 90;
  label?: string;
  allowWrite?: boolean;
  clientId?: string;
  redirectUri?: string;
  state?: string;
  resource?: string;
  /** Altera/omite parâmetros do /authorize. */
  authorizeOverrides?: Record<string, string | null>;
  /** Altera o corpo da decisão. */
  decisionOverrides?: Record<string, unknown>;
  verifierOverride?: string;
};

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresIn: number;
  clientId: string;
  redirectUri: string;
  requestId: string;
  code: string;
};

export function form(data: Record<string, string>, extra: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...extra },
    body: new URLSearchParams(data).toString(),
  });
}

export async function postToken(
  data: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const res = await tokenPOST(form(data, headers));
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : {}) as Record<string, any>,
    headers: res.headers,
  };
}

export async function postRevoke(data: Record<string, string>) {
  const res = await revokePOST(
    new Request(`${ORIGIN}/api/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(),
    }),
  );
  return { status: res.status, body: await res.json() };
}

export function authorizeUrl(o: DanceOptions, challenge: string): string {
  const q: Record<string, string | null> = {
    response_type: "code",
    client_id: o.clientId ?? CIMD_URL,
    redirect_uri: o.redirectUri ?? REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: o.resource ?? RESOURCE,
    scope: (o.scopes ?? ["read"]).join(" "),
    state: o.state ?? "st-123",
    ...(o.authorizeOverrides ?? {}),
  };
  const u = new URL(`${ORIGIN}/oauth/authorize`);
  for (const [k, v] of Object.entries(q)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

export async function getAuthorize(url: string, headers: Record<string, string> = {}) {
  const res = await authorizeGET(new Request(url, { headers }));
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

export async function postDecision(member: Caller, body: Record<string, unknown>) {
  const res = await decisionPOST(
    new Request(`${ORIGIN}/api/oauth/authorize/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        host: "localhost:3100",
        cookie: member.cookie,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** Fluxo completo: PRM -> metadados do AS -> authorize -> consentimento -> token. */
export async function oauthDance(o: DanceOptions): Promise<Tokens> {
  const prm = await (await prmMcpGET()).json();
  const as = await (await asMetadataGET()).json();
  if (prm.resource !== RESOURCE || prm.authorization_servers[0] !== as.issuer) {
    throw new Error("metadados inconsistentes");
  }
  const { verifier, challenge } = pkcePair();
  const auth = await getAuthorize(authorizeUrl(o, challenge));
  const consent = new URL(auth.location);
  const requestId = consent.searchParams.get("request");
  if (auth.status !== 302 || !consent.pathname.endsWith("/oauth/consent") || !requestId) {
    throw new Error(`authorize não gerou consentimento: ${auth.status} ${auth.location}`);
  }
  const decision = await postDecision(o.member, {
    requestId,
    decision: "allow",
    label: o.label ?? "Meu Claude",
    validityDays: o.validityDays ?? 30,
    allowWrite: o.allowWrite ?? false,
    privacyAcknowledged: true,
    ...(o.allowWrite ? { writeAcknowledged: true } : {}),
    ...(o.decisionOverrides ?? {}),
  });
  if (decision.status !== 200)
    throw new Error(`decisão falhou: ${decision.status} ${JSON.stringify(decision.body)}`);
  const back = new URL(decision.body.redirectTo);
  const code = back.searchParams.get("code") as string;
  const tok = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: o.redirectUri ?? REDIRECT_URI,
    client_id: o.clientId ?? CIMD_URL,
    code_verifier: o.verifierOverride ?? verifier,
    resource: RESOURCE,
  });
  if (tok.status !== 200)
    throw new Error(`token falhou: ${tok.status} ${JSON.stringify(tok.body)}`);
  return {
    accessToken: tok.body.access_token,
    refreshToken: tok.body.refresh_token,
    scope: tok.body.scope,
    expiresIn: tok.body.expires_in,
    clientId: o.clientId ?? CIMD_URL,
    redirectUri: o.redirectUri ?? REDIRECT_URI,
    requestId,
    code,
  };
}

export function refresh(
  t: Pick<Tokens, "refreshToken" | "clientId">,
  refreshToken = t.refreshToken,
) {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: t.clientId,
    resource: RESOURCE,
  });
}

export type Era = "2025-11-25" | "2026-07-28";
const ENVELOPE = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "teste", version: "1" },
};

/** JSON-RPC em `POST /api/mcp` com os cabeçalhos certos de cada era. */
export async function mcpCall(
  bearer: string | null,
  method: string,
  params: Record<string, unknown> = {},
  o: { era?: Era | string; headers?: Record<string, string>; id?: number | string } = {},
) {
  const era = o.era ?? "2025-11-25";
  const modern = era === "2026-07-28";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": era,
    ...(modern
      ? {
          "mcp-method": method,
          ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
        }
      : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    ...(o.headers ?? {}),
  };
  const body = {
    jsonrpc: "2.0",
    id: o.id ?? 1,
    method,
    params: modern ? { ...params, _meta: ENVELOPE } : params,
  };
  const res = await mcpPOST(
    new Request(RESOURCE, { method: "POST", headers, body: JSON.stringify(body) }),
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, body: json, text };
}

export const toolCall = (
  bearer: string | null,
  name: string,
  args: Record<string, unknown> = {},
  o = {},
) => mcpCall(bearer, "tools/call", { name, arguments: args }, o);

export const initialize = (bearer: string | null) =>
  mcpCall(bearer, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "teste", version: "1" },
  });

export { asMetadataGET, prmGET, prmMcpGET };
