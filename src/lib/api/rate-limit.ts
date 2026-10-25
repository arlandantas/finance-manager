import type { PrismaClient } from "@/generated/prisma/client";
import { hit } from "@/modules/mcp/rate-limit";

/** Teto por usuário nas rotas `/api/v1` (SEC-020). Muito acima do uso humano; freia loops e abuso. */
export const API_RATE_PER_MIN = 300;

/** Reaproveita o contador atômico em Postgres (`mcp_rate_buckets`), válido na Vercel serverless. */
export function hitApiRate(db: Pick<PrismaClient, "$queryRaw">, userId: string, now: Date) {
  return hit(db, `api:${userId}:min`, API_RATE_PER_MIN, 60, now);
}
