import { config } from "dotenv";
import { createPrismaClient } from "../src/lib/db";

/**
 * SEC-018 fase 2 (SDD-028 §6.1): conferência SOMENTE LEITURA antes de promover a migração pendente
 * (prisma/pending/*_sec018_drop_plain_session_token). Uso:
 *   pnpm tsx scripts/sec018-phase2-check.ts --since 2026-10-26T12:00:00Z
 * `--since` = instante do deploy da fase 1 em produção. Imprime só contagens; sai com código 1 se houver
 * sessão criada depois do deploy com o token em texto (código antigo ainda gravando) ou se o intervalo
 * mínimo de 1 dia ainda não passou.
 */
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const arg = process.argv.indexOf("--since");
const since = arg >= 0 ? new Date(process.argv[arg + 1] ?? "") : null;
if (!since || Number.isNaN(since.getTime())) {
  console.error("Informe --since <ISO do deploy da fase 1>");
  process.exit(2);
}
const db = createPrismaClient();
db.$queryRaw<Array<{ n: bigint }>>`
  SELECT count(*) AS n FROM sessions WHERE "sessionToken" IS NOT NULL AND "createdAt" > ${since}`
  .then(async (rows) => {
    const n = Number(rows[0]?.n ?? 0);
    const days = (Date.now() - since.getTime()) / 86_400_000;
    console.log(`sessões novas com token em texto: ${n} · dias desde a fase 1: ${days.toFixed(1)}`);
    await db.$disconnect();
    process.exit(n === 0 && days >= 1 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
