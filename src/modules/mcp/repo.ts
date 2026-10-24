import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

/** Única porta de acesso ao cliente Prisma para rotas/handlers do MCP (regra `db-import`). */
export function mcpDb(): PrismaClient {
  return getDb();
}
