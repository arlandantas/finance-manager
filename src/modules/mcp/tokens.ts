import { createHash } from "node:crypto";
import { randomToken, sha256Hex } from "@/lib/ids";

// SDD-024 §2: valores de token nunca são gravados, só o SHA-256 hex.
export type TokenKind = "CODE" | "ACCESS" | "REFRESH";
const PREFIX: Record<TokenKind, string> = { CODE: "fmc_", ACCESS: "fma_", REFRESH: "fmr_" };

export function newTokenValue(kind: TokenKind): { value: string; hash: string } {
  const value = PREFIX[kind] + randomToken(32);
  return { value, hash: sha256Hex(value) };
}

export const hashToken = sha256Hex;

/** PKCE S256: BASE64URL(SHA256(verifier)). */
export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
