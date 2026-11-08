import { createHash, timingSafeEqual } from "node:crypto";
import { randomToken, sha256Hex } from "@/lib/ids";

// SDD-024 §2: valores de token nunca são gravados, só o SHA-256 hex.
export type TokenKind = "CODE" | "ACCESS" | "REFRESH" | "PAT";
const PREFIX: Record<TokenKind, string> = {
  CODE: "fmc_",
  ACCESS: "fma_",
  REFRESH: "fmr_",
  PAT: "fmp_",
};

/** ADR-043 §2: formato do token pessoal (também serve à varredura de segredo). */
export const PAT_REGEX = /^fmp_[A-Za-z0-9_-]{43}$/;
/** Bearer aceito em `/api/mcp`: fora disso é recusado sem consultar o banco. */
export const BEARER_REGEX = /^fm[ap]_[A-Za-z0-9_-]{43}$/;

export function newTokenValue(kind: TokenKind): { value: string; hash: string } {
  const value = PREFIX[kind] + randomToken(32);
  return { value, hash: sha256Hex(value) };
}

export const hashToken = sha256Hex;

/** PKCE S256: BASE64URL(SHA256(verifier)). */
export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Comparação em tempo constante de dois hashes hex. */
export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
