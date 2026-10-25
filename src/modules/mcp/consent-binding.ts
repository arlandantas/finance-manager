import { timingSafeEqual } from "node:crypto";
import { sha256Hex } from "@/lib/ids";
import { AUTH_REQUEST_TTL_S, issuerOf } from "@/modules/mcp/config";

type Env = Record<string, string | undefined>;

// SEC-011 (SDD-028 §4.2): o pedido de autorização fica amarrado ao navegador que o iniciou por um cookie
// `__Host-mcp_authz=<requestId>.<nonce>` (HttpOnly, Secure, SameSite=Lax, 10 min). Em dev sem HTTPS: `mcp_authz`, sem Secure.
export const isSecureApp = (env: Env = process.env) => issuerOf(env).startsWith("https://");
export const consentCookieName = (secure: boolean) => (secure ? "__Host-mcp_authz" : "mcp_authz");

export function setConsentCookie(requestId: string, nonce: string, secure: boolean): string {
  return [
    `${consentCookieName(secure)}=${requestId}.${nonce}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${AUTH_REQUEST_TTL_S}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearConsentCookie(secure: boolean): string {
  return [
    `${consentCookieName(secure)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Valor bruto do cookie de consentimento no cabeçalho `cookie` (ou `null`). */
export function readConsentCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name === "__Host-mcp_authz" || name === "mcp_authz") return part.slice(idx + 1).trim();
  }
  return null;
}

/** O cookie pertence a este pedido e o nonce confere com o hash gravado (tempo constante). Sem hash => falha fechada. */
export function bindingMatches(
  req: { id: string; browserNonceHash: string | null },
  cookieValue: string | null | undefined,
): boolean {
  if (!req.browserNonceHash || !cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot < 0 || cookieValue.slice(0, dot) !== req.id) return false;
  const got = Buffer.from(sha256Hex(cookieValue.slice(dot + 1)), "hex");
  const want = Buffer.from(req.browserNonceHash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
