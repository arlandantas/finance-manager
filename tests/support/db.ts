import { execSync } from "node:child_process";
import { config } from "dotenv";
import { createPrismaClient } from "@/lib/db";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://finance:finance_test_password@localhost:5443/finance_test?schema=public";

let client: ReturnType<typeof createPrismaClient> | undefined;

/** Cliente Prisma do banco de teste (db-test, 5443). Nunca aponta para o banco de desenvolvimento. */
export function testDb() {
  client ??= createPrismaClient(TEST_DATABASE_URL);
  return client;
}

export async function closeTestDb() {
  await client?.$disconnect();
  client = undefined;
}

/** Aplica as migrações do repositório (inclusive SQL cru) no banco de teste. */
export function migrateTestDb() {
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

/** TRUNCATE de todas as tabelas de domínio (SDD-006 §3.3). Preserva `_prisma_migrations` e `SystemInfo`. */
export async function resetDb() {
  const db = testDb();
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'SystemInfo')`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  // Requisições do app ainda em curso do cenário anterior podem causar deadlock (40P01): repete.
  for (let attempt = 1; ; attempt++) {
    try {
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
      return;
    } catch (e) {
      if (attempt >= 4 || !String(e).includes("40P01")) throw e;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
}
