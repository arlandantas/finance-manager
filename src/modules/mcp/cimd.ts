import { z } from "zod";
import { CIMD_MAX_BYTES, CIMD_TIMEOUT_MS } from "@/modules/mcp/config";
import { isAcceptableRedirectUri } from "@/modules/mcp/redirect";

// SDD-024 §4.7: Client ID Metadata Document. O cliente é identificado por uma URL https cujo conteúdo
// descreve o cliente. A busca é a única chamada de rede de saída do AS: protegida contra SSRF.
export type CimdClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  softwareId: string | null;
};

export class CimdError extends Error {
  constructor(public readonly reason: string) {
    super(`CIMD inválido: ${reason}`);
  }
}

const DocSchema = z.object({
  client_id: z.string(),
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
  software_id: z.string().max(200).optional(),
});

/** Controles C0/C1 e caracteres invisíveis/de direção (U+200B-200F, U+2028-202E, U+2066-2069). */
function isHiddenChar(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** Saneia nomes exibidos: NFKC, sem caracteres de controle/formatação, ≤ 80. */
export function sanitizeClientName(raw: string | undefined): string {
  const cleaned = Array.from((raw ?? "").normalize("NFKC"), (ch) =>
    isHiddenChar(ch.codePointAt(0) ?? 0) ? " " : ch,
  ).join("");
  const s = cleaned.replace(/\s+/g, " ").trim().slice(0, 80);
  return s || "Assistente sem nome";
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

/** Valida a URL do `client_id` sem rede: https, host permitido, caminho não vazio, sem credenciais/porta/fragmento. */
export function assertCimdUrl(clientId: string, allowedHosts: string[]): URL {
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    throw new CimdError("url");
  }
  if (u.protocol !== "https:") throw new CimdError("scheme");
  if (u.username || u.password || u.hash || u.port) throw new CimdError("url");
  if (!allowedHosts.includes(u.hostname.toLowerCase())) throw new CimdError("host");
  if (u.pathname === "" || u.pathname === "/") throw new CimdError("path");
  return u;
}

export async function fetchCimd(
  clientId: string,
  allowedHosts: string[],
  fetchImpl: FetchImpl = fetch,
): Promise<CimdClient> {
  const url = assertCimdUrl(clientId, allowedHosts);
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    });
  } catch {
    throw new CimdError("fetch");
  }
  if (res.status !== 200)
    throw new CimdError(res.status >= 300 && res.status < 400 ? "redirect" : "status");
  if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
    throw new CimdError("content-type");
  }
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > CIMD_MAX_BYTES) throw new CimdError("size");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > CIMD_MAX_BYTES) throw new CimdError("size");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new CimdError("json");
  }
  const doc = DocSchema.safeParse(json);
  if (!doc.success) throw new CimdError("schema");
  if (doc.data.client_id !== clientId) throw new CimdError("client_id");
  const method = doc.data.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") throw new CimdError("auth_method");
  if (!doc.data.redirect_uris.every(isAcceptableRedirectUri)) throw new CimdError("redirect_uris");
  return {
    clientId,
    clientName: sanitizeClientName(doc.data.client_name),
    redirectUris: doc.data.redirect_uris,
    softwareId: doc.data.software_id ?? null,
  };
}
