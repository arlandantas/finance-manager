import { cimdAllowedClientIds } from "@/modules/mcp/config";

type Env = Record<string, string | undefined>;

/**
 * SEC-011 (SDD-028 §4.3): nome de exibição por DOMÍNIO, definido no servidor (nunca o `client_name` do documento).
 * Um cliente é "verificado" quando é CIMD e sua URL EXATA está em `MCP_CIMD_ALLOWED_CLIENT_IDS` (SEC-010).
 */
export const VERIFIED_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "claude.ai": "Claude",
};

export type ConsentClientView =
  | { verified: true; displayName: string; domain: string; redirectUrl: string }
  | { verified: false; reportedName: string; clientHost: string | null; redirectUrl: string };

/** `origin + pathname` da redirect_uri exata (sem query). */
export function redirectDisplay(redirectUri: string): string {
  try {
    const u = new URL(redirectUri);
    return `${u.origin}${u.pathname}`;
  } catch {
    return redirectUri;
  }
}

export function isVerifiedClient(
  client: { clientId: string; kind: string },
  env: Env = process.env,
): boolean {
  return client.kind === "CIMD" && cimdAllowedClientIds(env).includes(client.clientId);
}

export function consentClientView(
  client: { clientId: string; kind: string; clientName: string },
  redirectUri: string,
  env: Env = process.env,
): ConsentClientView {
  const redirectUrl = redirectDisplay(redirectUri);
  if (isVerifiedClient(client, env)) {
    const domain = new URL(client.clientId).hostname;
    return {
      verified: true,
      displayName: VERIFIED_DISPLAY_NAMES[domain] ?? domain,
      domain,
      redirectUrl,
    };
  }
  let clientHost: string | null = null;
  try {
    if (/^https?:\/\//.test(client.clientId)) clientHost = new URL(client.clientId).host;
  } catch {
    clientHost = null;
  }
  return { verified: false, reportedName: client.clientName, clientHost, redirectUrl };
}
