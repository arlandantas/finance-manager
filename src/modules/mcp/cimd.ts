import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { isHiddenChar } from "@/lib/text/hidden-chars";
import { CIMD_MAX_BYTES, CIMD_TIMEOUT_MS } from "@/modules/mcp/config";

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

/** Saneia nomes exibidos: NFKC, sem caracteres de controle/formatação, ≤ 80. */
export function sanitizeClientName(raw: string | undefined): string {
  const cleaned = Array.from((raw ?? "").normalize("NFKC"), (ch) =>
    isHiddenChar(ch.codePointAt(0) ?? 0) ? " " : ch,
  ).join("");
  const s = cleaned.replace(/\s+/g, " ").trim().slice(0, 80);
  return s || "Assistente sem nome";
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export type LookupImpl = (host: string) => Promise<Array<{ address: string }>>;

let dnsLookup: LookupImpl = (host) => lookup(host, { all: true });
/** Só para testes: troca a resolução de DNS (a suíte não acessa a rede). */
export function setCimdDnsLookup(fn: LookupImpl | null) {
  dnsLookup = fn ?? ((host) => lookup(host, { all: true }));
}

/** Endereço que um cliente CIMD nunca pode ter: loopback, privado, link-local, 0/8, CGNAT, multicast. */
export function isPrivateAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const [a = 0, b = 0] = addr.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = addr.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true; // não é IP válido: recusa
}

/**
 * SEC-010 (SDD-028 §3.2): valida a URL do `client_id` sem rede. Forma canônica, https, sem credenciais,
 * porta, query ou fragmento, host não-IP, e IGUALDADE EXATA com a lista de URLs permitidas.
 */
export function assertCimdUrl(clientId: string, allowedClientIds: readonly string[] | "any"): URL {
  if (clientId.length > 512 || !/^[\x21-\x7e]+$/.test(clientId)) throw new CimdError("url");
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    throw new CimdError("url");
  }
  if (u.protocol !== "https:") throw new CimdError("scheme");
  if (u.username || u.password || u.hash || u.port || u.search) throw new CimdError("url");
  if (u.href !== clientId) throw new CimdError("not_canonical");
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) !== 0 || u.hostname.endsWith(".")) {
    throw new CimdError("ip_host");
  }
  if (allowedClientIds !== "any" && !allowedClientIds.includes(clientId)) {
    throw new CimdError("not_allowed");
  }
  return u;
}

/** `redirect_uri` de cliente CIMD: https, sem credenciais nem fragmento, no MESMO host do `client_id`. Loopback não vale. */
export function isCimdRedirectUri(raw: string, clientHost: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.hash &&
    u.hostname === clientHost &&
    u.href === raw
  );
}

/** Lê o corpo em stream com teto de bytes; cancela o leitor ao passar (mesmo com content-length mentindo). */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) throw new CimdError("json");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new CimdError("size");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export async function fetchCimd(
  clientId: string,
  allowedClientIds: readonly string[] | "any",
  fetchImpl: FetchImpl = fetch,
): Promise<CimdClient> {
  const url = assertCimdUrl(clientId, allowedClientIds);
  try {
    const addrs = await dnsLookup(url.hostname);
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
      throw new CimdError("ssrf");
    }
  } catch (e) {
    if (e instanceof CimdError) throw e;
    throw new CimdError("fetch");
  }
  let res: Response;
  let buf: Uint8Array;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    });
    if (res.status !== 200) {
      throw new CimdError(res.status >= 300 && res.status < 400 ? "redirect" : "status");
    }
    const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") throw new CimdError("content-type");
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > CIMD_MAX_BYTES) throw new CimdError("size");
    buf = await readCapped(res, CIMD_MAX_BYTES);
  } catch (e) {
    if (e instanceof CimdError) throw e;
    throw new CimdError("fetch");
  }
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
  if (doc.data.redirect_uris.length > 5) throw new CimdError("redirect_uris");
  if (!doc.data.redirect_uris.every((r) => isCimdRedirectUri(r, url.hostname))) {
    throw new CimdError("redirect_uris");
  }
  return {
    clientId,
    clientName: sanitizeClientName(doc.data.client_name),
    redirectUris: doc.data.redirect_uris,
    softwareId: doc.data.software_id ?? null,
  };
}
