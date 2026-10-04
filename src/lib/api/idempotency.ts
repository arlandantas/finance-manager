import { z } from "zod";
import type { Tx } from "@/lib/api/types";
import { sha256Hex } from "@/lib/ids";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
const keySchema = z.uuid();

export function parseIdempotencyKey(raw: string | null): string | null {
  if (!raw) return null;
  const r = keySchema.safeParse(raw.trim());
  return r.success ? r.data : null;
}

/** JSON canônico (chaves ordenadas) para o hash do corpo. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const requestHash = (method: string, path: string, body: unknown) =>
  sha256Hex(`${method}\n${path}\n${canonicalJson(body ?? null)}`);

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; replay: { status: number; body: unknown } }
  | { claimed: false; reused: true };

let mutationCounter = 0;

/**
 * ADR-009: reivindica a chave dentro da transação da mutação. `INSERT … ON CONFLICT DO NOTHING`:
 * a segunda requisição concorrente espera o commit da primeira (índice único) e então lê a resposta guardada.
 */
export async function claimIdempotencyKey(
  tx: Tx,
  a: { userId: string; key: string; method: string; path: string; hash: string },
): Promise<ClaimResult> {
  const inserted = await tx.$executeRaw`
    INSERT INTO idempotency_records (id, "userId", key, method, path, "requestHash", "responseStatus", "responseBody")
    VALUES (gen_random_uuid(), ${a.userId}::uuid, ${a.key}, ${a.method}, ${a.path}, ${a.hash}, 0, '{}'::jsonb)
    ON CONFLICT ("userId", key) DO NOTHING`;
  if (inserted === 1) {
    mutationCounter += 1;
    if (mutationCounter % 100 === 0) {
      // Retenção de 24 h (ADR-009 §5), limpeza oportunista.
      await tx.$executeRaw`DELETE FROM idempotency_records WHERE "createdAt" < now() - interval '24 hours'`;
    }
    return { claimed: true };
  }
  const existing = await tx.idempotencyRecord.findUnique({
    where: { userId_key: { userId: a.userId, key: a.key } },
  });
  if (!existing || existing.requestHash !== a.hash || existing.responseStatus === 0) {
    return { claimed: false, reused: true };
  }
  return {
    claimed: false,
    replay: { status: existing.responseStatus, body: existing.responseBody },
  };
}

export async function saveIdempotentResponse(
  tx: Tx,
  a: { userId: string; key: string; status: number; body: unknown },
) {
  await tx.idempotencyRecord.update({
    where: { userId_key: { userId: a.userId, key: a.key } },
    data: { responseStatus: a.status, responseBody: (a.body ?? {}) as object },
  });
}
