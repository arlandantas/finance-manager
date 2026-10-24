import { config } from "dotenv";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/lib/db";
import { purgeLlmUsage, purgeSpendingAnalyses } from "../src/modules/ia/purge";

/**
 * Scripts operacionais da IA (SDD-021 §5), NUNCA rota HTTP. Sem conteúdo nas saídas.
 *  - `pnpm ai:set-cap <familyId> <centavos|default>`: sobrescreve (ou limpa) o teto mensal da família.
 *  - `pnpm ai:purge-usage [--months 24]`: apaga eventos de consumo mais antigos que N meses.
 *  - `pnpm ai:purge-analyses [--months 24]`: apaga análises de gastos mais antigas que N meses (TL-25, US-073).
 */
export async function run(
  db: PrismaClient,
  args: string[],
  out: (line: string) => void = console.log,
  now: Date = new Date(),
): Promise<number> {
  const [cmd, ...rest] = args;
  if (cmd === "set-cap") {
    const [familyId, value] = rest;
    if (!familyId || !value) {
      out("uso: ai:set-cap <familyId> <centavos|default>");
      return 2;
    }
    const cents = value === "default" ? null : Number(value);
    if (cents !== null && (!Number.isInteger(cents) || cents < 0)) {
      out("centavos deve ser um inteiro >= 0");
      return 2;
    }
    const r = await db.family.updateMany({
      where: { id: familyId },
      data: { aiMonthlyCapCents: cents },
    });
    if (r.count === 0) {
      out("família não encontrada");
      return 1;
    }
    out(
      `teto da família ${familyId}: ${cents === null ? "padrão do ambiente" : `${cents} centavos`}`,
    );
    return 0;
  }
  if (cmd === "purge-usage") {
    const i = rest.indexOf("--months");
    const months = i >= 0 ? Number(rest[i + 1]) : 24;
    if (!Number.isInteger(months) || months < 1) {
      out("--months deve ser um inteiro >= 1");
      return 2;
    }
    out(`eventos de consumo apagados: ${await purgeLlmUsage(db, now, months)}`);
    return 0;
  }
  if (cmd === "purge-analyses") {
    const i = rest.indexOf("--months");
    const months = i >= 0 ? Number(rest[i + 1]) : 24;
    if (!Number.isInteger(months) || months < 1) {
      out("--months deve ser um inteiro >= 1");
      return 2;
    }
    out(`análises apagadas: ${await purgeSpendingAnalyses(db, now, months)}`);
    return 0;
  }
  out("comandos: set-cap | purge-usage | purge-analyses");
  return 2;
}

if (process.argv[1]?.endsWith("ai-admin.ts")) {
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
