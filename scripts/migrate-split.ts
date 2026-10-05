import { config } from "dotenv";
import type { PrismaClient } from "../src/generated/prisma/client";
import { todayInFamilyTz } from "../src/lib/dates";
import { createPrismaClient } from "../src/lib/db";
import {
  DryRunRollback,
  GateError,
  type MigrationReport,
  migrateFamily,
  RollbackRefused,
  rollbackEngine,
  verifySplit,
} from "../src/modules/split/migrate-family";

/**
 * Script operacional da EN-002b (SDD-015 §4.6): NUNCA é rota HTTP. Uma transação por família, em ordem de
 * `id`; continua depois da falha de uma família e sai com código 1 se houver qualquer falha (a etapa é
 * obrigatória no deploy). Opções: --dry-run · --family <uuid> · --today YYYY-MM-DD · --verify ·
 * --engine LEGACY|STORED (com --family) · --rollback [--purge] (recusa ⇒ código 2).
 * Logs sem valores individuais: só contagens e `periodKey`.
 */
export type Output = (line: string) => void;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function run(
  db: PrismaClient,
  args: string[],
  out: Output = console.log,
): Promise<number> {
  const familyId = flag(args, "--family");
  const families = await db.family.findMany({
    where: familyId ? { id: familyId } : {},
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const timeout = { timeout: 600_000, maxWait: 60_000 };

  if (args.includes("--verify")) {
    const problems = await db.$transaction((tx) => verifySplit(tx, familyId), timeout);
    for (const p of problems)
      out(`VERIFY FALHOU ${p.familyId}: ${p.problem}${p.detail ? ` (${p.detail})` : ""}`);
    out(problems.length === 0 ? "verify: ok" : `verify: ${problems.length} problema(s)`);
    return problems.length === 0 ? 0 : 1;
  }

  const engine = flag(args, "--engine");
  if (engine === "LEGACY" || args.includes("--rollback")) {
    if (engine === "LEGACY" && !familyId) {
      out("--engine LEGACY exige --family");
      return 1;
    }
    const purge = args.includes("--purge");
    let code = 0;
    for (const f of families) {
      try {
        await db.$transaction((tx) => rollbackEngine(tx, f.id, { purge }), timeout);
        out(`ROLLED_BACK ${f.id}${purge ? " (purge)" : ""}`);
      } catch (e) {
        if (e instanceof RollbackRefused) {
          out(`RECUSADA ${f.id}: ${e.reason}`);
          code = 2;
          break;
        }
        out(`FAILED ${f.id}: ${(e as Error).message}`);
        code = code || 1;
      }
    }
    return code;
  }

  const dryRun = args.includes("--dry-run");
  const today = flag(args, "--today") ?? todayInFamilyTz({ now: () => new Date() });
  const results = { DONE: 0, SKIPPED: 0, FAILED: 0, DRY_RUN: 0 };
  for (const f of families) {
    try {
      const report = await db.$transaction(
        (tx) => migrateFamily(tx, f.id, { today, dryRun }),
        timeout,
      );
      results[report.status] += 1;
      out(
        `${report.status} ${f.id} periodos=${report.periods} despesas=${report.activeExpenses} excluidas=${report.deletedExpenses} pessoais=${report.personalExpenses}`,
      );
    } catch (e) {
      if (e instanceof DryRunRollback) {
        results.DRY_RUN += 1;
        const r: MigrationReport = e.report;
        out(
          `DRY_RUN ${f.id} periodos=${r.periods} despesas=${r.activeExpenses} excluidas=${r.deletedExpenses} pessoais=${r.personalExpenses} (gate ok; nada gravado)`,
        );
      } else if (e instanceof GateError) {
        results.FAILED += 1;
        out(`FAILED ${f.id}: gate no período ${e.periodKey}, campo ${e.field}`);
      } else {
        results.FAILED += 1;
        out(`FAILED ${f.id}: ${(e as Error).message}`);
      }
    }
  }
  out(
    `resumo: DONE=${results.DONE} SKIPPED=${results.SKIPPED} DRY_RUN=${results.DRY_RUN} FAILED=${results.FAILED}`,
  );
  return results.FAILED > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith("migrate-split.ts")) {
  // Mesma precedência do Next e do Prisma: .env.local, depois .env (o que já está no ambiente prevalece).
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
  const db = createPrismaClient();
  run(db, process.argv.slice(2))
    .then(async (code) => {
      await db.$disconnect();
      process.exit(code);
    })
    .catch(async (e) => {
      console.error(e);
      await db.$disconnect();
      process.exit(1);
    });
}
