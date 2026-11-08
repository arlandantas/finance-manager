import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

// ADR-042 §10: importToken = HMAC-SHA256 de {familyId, cardId, fileHash, source, issuedAt}; prova o
// fileHash sem guardar nada. Chave derivada de AUTH_SECRET por HKDF (rótulo próprio).
export const IMPORT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

export type ImportTokenPayload = {
  familyId: string;
  cardId: string;
  fileHash: string;
  source: "CSV" | "PDF";
  issuedAt: number;
};

export const hashFile = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "invoice-import", 32));
}

function secretFromEnv(): string {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente");
  return secret;
}

const mac = (body: string, secret: string) =>
  createHmac("sha256", key(secret)).update(body).digest("base64url");

export function issueImportToken(
  input: Omit<ImportTokenPayload, "issuedAt">,
  now: Date,
  secret: string = secretFromEnv(),
): string {
  const payload: ImportTokenPayload = { ...input, issuedAt: now.getTime() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** Devolve o payload se a assinatura, a validade (2 h), a família e o cartão conferem; senão `null`. */
export function verifyImportToken(
  token: string,
  expected: { familyId: string; cardId: string },
  now: Date,
  secret: string = secretFromEnv(),
): ImportTokenPayload | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let p: ImportTokenPayload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ImportTokenPayload;
  } catch {
    return null;
  }
  if (p.familyId !== expected.familyId || p.cardId !== expected.cardId) return null;
  const age = now.getTime() - p.issuedAt;
  if (!Number.isFinite(age) || age > IMPORT_TOKEN_TTL_MS || age < -CLOCK_SKEW_MS) return null;
  return p;
}
