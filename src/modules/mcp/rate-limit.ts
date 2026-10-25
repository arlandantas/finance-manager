import type { PrismaClient } from "@/generated/prisma/client";

// SDD-024 §6 / ADR-031 §7: janela fixa no Postgres, atômica. Nada em memória (instâncias são descartáveis).
type Q = Pick<PrismaClient, "$queryRaw">;

export type HitResult = { ok: true } | { ok: false; retryAfterS: number };

export async function hit(
  db: Q,
  key: string,
  limit: number,
  windowS: number,
  now: Date,
): Promise<HitResult> {
  const windowMs = windowS * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO mcp_rate_buckets ("key", "windowStart", "count") VALUES (${key}, ${start}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = mcp_rate_buckets."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  if (count <= limit) return { ok: true };
  const retryAfterS = Math.max(1, Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000));
  return { ok: false, retryAfterS };
}

/** Devolve uma unidade da cota (ex.: a exportação falhou por culpa do servidor). Nunca fica abaixo de zero. */
export async function refund(
  db: Pick<PrismaClient, "$executeRaw">,
  key: string,
  windowS: number,
  now: Date,
): Promise<void> {
  const windowMs = windowS * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  await db.$executeRaw`UPDATE mcp_rate_buckets SET "count" = GREATEST("count" - 1, 0)
    WHERE "key" = ${key} AND "windowStart" = ${start}`;
}
