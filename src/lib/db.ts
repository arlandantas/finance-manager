import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

/** ADR-031 §3: Prisma Postgres Free = 10 conexões pooled; poucas instâncias × 3 cabe. */
export const DEFAULT_DB_POOL_MAX = 3;

export function createPrismaClient(connectionString = getEnv().DATABASE_URL) {
  // Pool explícito para poder (a) limitar `max` e (b) entregá-lo ao `attachDatabasePool` na Vercel, que fecha
  // conexões ociosas antes de a instância (Fluid compute) suspender. Fora da Vercel, comportamento idêntico ao antigo.
  const onVercel = !!process.env.VERCEL;
  // Na Vercel o padrão é 3 (limite do Free); fora dela, o padrão do `pg` (10): dev e testes têm transações
  // aninhadas e concorrência (ex.: análise de IA) e não dividem o limite do Prisma Postgres.
  const max = getEnv().DB_POOL_MAX ?? (onVercel ? DEFAULT_DB_POOL_MAX : undefined);
  const pool = new Pool({
    connectionString,
    ...(max !== undefined ? { max } : {}),
    ...(onVercel ? { idleTimeoutMillis: 5000 } : {}),
  });
  if (onVercel) attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

// Singleton para sobreviver ao HMR do Next em desenvolvimento (e reutilizar o pool por instância).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
