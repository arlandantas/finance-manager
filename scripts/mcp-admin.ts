import { config } from "dotenv";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/lib/db";
import { purgeMcp } from "../src/modules/mcp/purge";

/**
 * Scripts operacionais do MCP (SDD-024 §2), NUNCA rota HTTP. Mesma função de domínio do cron diário.
 *  - `pnpm mcp:purge`: auditoria > 12 meses, tokens vencidos há > 7 dias, pedidos expirados, clientes DCR
 *    ociosos e buckets de taxa antigos. Só contagens na saída.
 */
export async function run(
  db: PrismaClient,
  args: string[],
  out: (line: string) => void = console.log,
  now: Date = new Date(),
): Promise<number> {
  if (args[0] === "purge") {
    const c = await db.$transaction((tx) => purgeMcp(tx, now), { timeout: 55_000 });
    out(
      `auditoria: ${c.audit} · tokens: ${c.tokens} · pedidos: ${c.requests} · clientes: ${c.clients} · buckets: ${c.buckets}`,
    );
    return 0;
  }
  out("comandos: purge");
  return 2;
}

if (process.argv[1]?.endsWith("mcp-admin.ts")) {
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
  const db = createPrismaClient();
  run(db, process.argv.slice(2))
    .then(async (code) => {
      await db.$disconnect();
      process.exit(code);
    })
    .catch(async (e) => {
      console.error(e instanceof Error ? e.message : e);
      await db.$disconnect();
      process.exit(1);
    });
}
