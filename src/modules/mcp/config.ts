// SDD-024 §3 (+ §11): constantes e ambiente do servidor MCP / servidor de autorização OAuth.
type Env = Record<string, string | undefined>;

export const MCP_RESOURCE_PATH = "/api/mcp";
export const ACCESS_TTL_S = 3600; // 60 min (D-GES-36 d)
export const CODE_TTL_S = 60;
export const AUTH_REQUEST_TTL_S = 600;
export const GRANT_VALIDITY_DAYS = [30, 90] as const;
export const SCOPES = ["read", "write"] as const;
export type McpScope = (typeof SCOPES)[number];
/** Escopos que o AS anuncia/aceita no pedido (`offline_access` não vira permissão: o refresh já é emitido). */
export const SUPPORTED_SCOPES = ["read", "write", "offline_access"] as const;

/** Limites de transporte: fixos, não configuráveis pelo membro (SDD-024 §11.3 remove `proposePerHour`). */
export const RATE = {
  grantPerMin: 60,
  grantPerDay: 1000,
  /** /token: por IP + client_id (o client_id do Claude é público, não pode ser a única chave: SEC-005). */
  tokenPerMin: 30,
  /** /token: por código/refresh apresentado (freia adivinhação sem afetar os demais usuários). */
  tokenPerSecretPerMin: 10,
  registerPerHour: 10,
  authorizePerMin: 20,
} as const;

export const MAX_BODY_BYTES = 64 * 1024;
export const CIMD_MAX_BYTES = 5120;
export const CIMD_CACHE_MS = 24 * 3600 * 1000;
export const CIMD_TIMEOUT_MS = 5000;

/** Produção/preview: MCP só liga com `MCP_ENABLED=true`; `VERCEL_ENV=preview` sempre desliga (SDD-024 §11.1). */
export function mcpEnabled(env: Env = process.env): boolean {
  if (env.VERCEL_ENV === "preview") return false;
  return env.MCP_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * SEC-010 (SDD-028 §3.1): URLs EXATAS de `client_id` CIMD autorizadas (lista separada por vírgula).
 * Vazia = nenhum cliente CIMD é aceito (falha fechada; o DCR continua valendo). `MCP_CIMD_ALLOWED_HOSTS`
 * está obsoleta e é ignorada (DEV-89).
 */
export function cimdAllowedClientIds(env: Env = process.env): string[] {
  return (env.MCP_CIMD_ALLOWED_CLIENT_IDS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function appUrl(env: Env): string {
  return (env.APP_URL?.trim() || "http://localhost:3100").replace(/\/+$/, "");
}

/** `issuer` do AS = origem pública do app. */
export function issuerOf(env: Env = process.env): string {
  return new URL(appUrl(env)).origin;
}

/** `resource` canônico (audiência do token): `${APP_URL}/api/mcp`. */
export function canonicalResource(env: Env = process.env): string {
  return `${issuerOf(env)}${MCP_RESOURCE_PATH}`;
}

export function prmUrl(env: Env = process.env): string {
  return `${issuerOf(env)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export const WWW_AUTH_SCOPE = "read write";
