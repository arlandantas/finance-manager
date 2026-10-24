import type { OAuthResult } from "@/modules/mcp/token-endpoint";

/** Lê `application/x-www-form-urlencoded` (corpo ≤ 16 KB); outro content-type => null. */
export async function readForm(req: Request): Promise<Record<string, string> | null> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/x-www-form-urlencoded")) return null;
  const text = await req.text();
  if (text.length > 16_384) return null;
  return Object.fromEntries(new URLSearchParams(text));
}

export function oauthFormResponse(r: OAuthResult): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { "content-type": "application/json", ...(r.headers ?? {}) },
  });
}
