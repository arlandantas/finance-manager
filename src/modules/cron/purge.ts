import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { purgeLlmUsage, purgeSpendingAnalyses } from "@/modules/ia/purge";

// ADR-031 §8: expurgos diários pelo Vercel Cron -> GET /api/cron/purge. Idempotente (cada tarefa é um
// DELETE ... WHERE createdAt < corte; execução duplicada é inofensiva), sem retry da Vercel.

export type PurgeTx = Pick<PrismaClient, "llmUsageEvent" | "spendingAnalysis"> &
  Partial<PrismaClient>;
export type PurgeTask = {
  name: string;
  run: (tx: PurgeTx, now: Date) => Promise<number>;
};

/** Registro das tarefas. A EN-006b acrescenta `mcp:purge` (SDD-024 §2) por `registerPurgeTask`. */
const tasks: PurgeTask[] = [
  { name: "ai:purge-usage", run: (tx, now) => purgeLlmUsage(tx, now) },
  { name: "ai:purge-analyses", run: (tx, now) => purgeSpendingAnalyses(tx, now) },
];

export function registerPurgeTask(task: PurgeTask): void {
  if (!tasks.some((t) => t.name === task.name)) tasks.push(task);
}

export function listPurgeTasks(): string[] {
  return tasks.map((t) => t.name);
}

/** `Authorization: Bearer <CRON_SECRET>` em tempo constante; segredo ausente/curto => sempre recusa. */
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 16) return false;
  if (!authorization) return false;
  const a = createHash("sha256").update(authorization).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export type PurgeResult = { task: string; deleted: number };

export async function runPurge(db: PrismaClient, now: Date): Promise<PurgeResult[]> {
  return db.$transaction(
    async (tx) => {
      // Duas execuções simultâneas (a Vercel pode duplicar) se serializam.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('cron:purge', 0))`;
      const results: PurgeResult[] = [];
      for (const t of tasks) {
        const deleted = await t.run(tx as unknown as PurgeTx, now);
        // Só contagens no log.
        logger.info({ task: t.name, deleted }, "cron purge");
        results.push({ task: t.name, deleted });
      }
      return results;
    },
    { timeout: 55_000, maxWait: 10_000 },
  );
}
