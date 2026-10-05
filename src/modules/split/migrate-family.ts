import { Prisma } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { apportion } from "@/lib/apportion";
import { fromDbDate } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import {
  allocateBackfill,
  diffSnapshots,
  type PeriodSnapshot,
  snapshotOf,
} from "@/modules/split/backfill";
import { explainByRules } from "@/modules/split/explain";
import { memberInputsOf, ruleInputsOf } from "@/modules/split/inputs";
import { splitRepo } from "@/modules/split/repo";
import { ruleAt } from "@/modules/split/rules";
import { loadSettlement } from "@/modules/split/service";
import { isPresent } from "@/modules/split/settlement";
import { legacyGroupWeights } from "@/modules/split/settlement-legacy";
import { splitAmount } from "@/modules/split/split-amount";

/**
 * Migração por família do acerto LEGACY para o rateio gravado (EN-002b, SDD-015 §4.5, ADR-016 §5, ADR-021).
 * UMA transação (READ COMMITTED) com a trava `FOR UPDATE` da família: fotografar ➜ preencher ➜ comparar
 * (gate de 1 centavo) ➜ virar a chave. Qualquer divergência lança `GateError` e desfaz TUDO da família.
 * Recebe o `tx` por parâmetro (sem importar `@/lib/db`).
 */
export const MIGRATION_NAME = "en002_split_stored";

export type MigrateOpts = {
  /** "Hoje" fixo da execução (data de calendário): entra no rótulo e no `explainByRules`. */
  today: string;
  /** Ensaio: executa tudo, confere o gate e desfaz (lança `DryRunRollback`). */
  dryRun?: boolean;
  /** SÓ para testes: lança depois de preencher `n` períodos (prova de atomicidade). */
  failAfter?: number;
};

export type MigrationReport = {
  familyId: string;
  status: "DONE" | "SKIPPED";
  periods: number;
  activeExpenses: number;
  deletedExpenses: number;
  personalExpenses: number;
  splitRows: number;
};

export class GateError extends Error {
  constructor(
    readonly familyId: string,
    readonly periodKey: string,
    readonly field: string,
    readonly expected: unknown,
    readonly actual: unknown,
  ) {
    super(
      `Gate falhou (família ${familyId}, ${periodKey}): ${field} esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
    );
    this.name = "GateError";
  }
}

export class DryRunRollback extends Error {
  constructor(readonly report: MigrationReport) {
    super("dry-run: transação desfeita de propósito");
    this.name = "DryRunRollback";
  }
}

export class FailAfterInjected extends Error {
  constructor() {
    super("falha injetada (failAfter)");
    this.name = "FailAfterInjected";
  }
}

export function contextOf(familyId: string, today: string): RequestContext {
  return {
    userId: "migrate-split",
    email: "migrate-split@local",
    name: null,
    image: null,
    clock: { now: () => new Date(`${today}T15:00:00Z`) },
    requestId: "migrate-split",
    memberId: "migrate-split",
    familyId,
    role: "ADMIN",
  };
}

/** Fotografia do acerto de um período pelo carregador de PRODUÇÃO (a mesma fonte do painel). */
export async function snapshotPeriod(
  tx: Tx,
  ctx: RequestContext,
  periodKey: string,
  today: string,
): Promise<PeriodSnapshot> {
  const l = await loadSettlement(tx, ctx, periodKey);
  const explain = explainByRules({
    period: l.period,
    today,
    rules: l.rules,
    members: l.memberInputs,
    expenses: l.expenseInputs,
    result: l.result,
  });
  const order = [...l.memberInputs].sort((a, b) => a.ordinal - b.ordinal).map((m) => m.id);
  return snapshotOf(periodKey, l.result, explain, order);
}

export async function migrateFamily(
  tx: Tx,
  familyId: string,
  opts: MigrateOpts,
): Promise<MigrationReport> {
  // 1) trava de família + idempotência (estado da família, não existência de linha)
  const locked = await tx.$queryRaw<Array<{ splitEngine: "LEGACY" | "STORED"; cutDay: number }>>`
    SELECT "splitEngine", "cutDay" FROM families WHERE id = ${familyId}::uuid FOR UPDATE`;
  const fam = locked[0];
  if (!fam) throw new Error(`Família ${familyId} não encontrada`);
  const done = await tx.dataMigration.findUnique({
    where: { name_familyId: { name: MIGRATION_NAME, familyId } },
  });
  const empty = {
    familyId,
    periods: 0,
    activeExpenses: 0,
    deletedExpenses: 0,
    personalExpenses: 0,
    splitRows: 0,
  };
  if (done?.state === "DONE") return { ...empty, status: "SKIPPED" };
  if (fam.splitEngine === "STORED") {
    // criada por código anterior à correção: registra DONE sem tocar nos dados
    await tx.dataMigration.upsert({
      where: { name_familyId: { name: MIGRATION_NAME, familyId } },
      update: { state: "DONE", finishedAt: new Date(), report: { native: true } },
      create: {
        name: MIGRATION_NAME,
        familyId,
        state: "DONE",
        finishedAt: new Date(),
        report: { native: true },
      },
    });
    return { ...empty, status: "SKIPPED" };
  }

  const ctx = contextOf(familyId, opts.today);
  const repo = splitRepo(tx, familyId);
  const cutDay = fam.cutDay;

  // 2) fotografar: união dos períodos das despesas comuns ativas e dos acertos ativos
  const shared = await tx.transaction.findMany({
    where: { familyId, kind: "EXPENSE", isSharedExpense: true, deletedAt: null },
    select: { competenceOn: true },
  });
  const settledKeys = await tx.transferGroup.findMany({
    where: { familyId, kind: "SETTLEMENT", deletedAt: null, settlementPeriod: { not: null } },
    select: { settlementPeriod: true },
  });
  const keys = [
    ...new Set([
      ...shared.map((e) => periodOf(fromDbDate(e.competenceOn), cutDay).key),
      ...settledKeys.map((g) => g.settlementPeriod as string),
    ]),
  ].sort();
  const before = new Map<string, PeriodSnapshot>();
  for (const key of keys) {
    const snap = await snapshotPeriod(tx, ctx, key, opts.today);
    before.set(key, snap);
    await tx.splitMigrationSnapshot.upsert({
      where: { familyId_periodKey: { familyId, periodKey: key } },
      update: { payload: snap as unknown as Prisma.InputJsonValue, takenAt: new Date() },
      create: { familyId, periodKey: key, payload: snap as unknown as Prisma.InputJsonValue },
    });
  }

  // 3) preencher
  const members = memberInputsOf(
    await tx.member.findMany({
      where: { familyId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    }),
  );
  const rules = ruleInputsOf(await repo.listRules());
  // resíduo de tentativa anterior: tudo da família recomeça do zero
  await tx.transactionSplit.deleteMany({ where: { familyId } });
  await tx.$executeRaw`UPDATE transactions SET "splitMode" = 'NONE', "splitRuleVersionId" = NULL WHERE "familyId" = ${familyId}::uuid AND "splitMode" <> 'NONE'`;

  let splitRows = 0;
  let activeCount = 0;
  let filled = 0;
  for (const key of keys) {
    const period = periodFromKey(key, cutDay);
    const rows = await repo.sharedExpenses(period.start, period.end);
    const expenses = rows.map((e) => ({
      id: e.id,
      amountInCents: toCents(e.amountInCents),
      payerMemberId: e.payerMemberId as string,
      occurredOn: fromDbDate(e.occurredOn),
      createdAt: e.createdAt.toISOString(),
    }));
    const alloc = allocateBackfill({ period, members, rules, expenses });
    splitRows += await persistAllocation(tx, familyId, alloc);
    activeCount += alloc.length;
    filled += 1;
    if (opts.failAfter !== undefined && filled >= opts.failAfter) throw new FailAfterInjected();
  }

  // despesas EXCLUÍDAS também recebem rateio (senão `restore` as deixaria inválidas; ADR-021 §6)
  const deleted = await tx.transaction.findMany({
    where: { familyId, kind: "EXPENSE", isSharedExpense: true, deletedAt: { not: null } },
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  for (const e of deleted) {
    const occurredOn = fromDbDate(e.occurredOn);
    const period = periodOf(fromDbDate(e.competenceOn), cutDay);
    const rule = ruleAt(rules, occurredOn);
    const present = members.filter((m) => isPresent(m, period) || m.id === e.payerMemberId);
    const weights = legacyGroupWeights({ rule, members: present, period }).filter(
      (w) => w.weight > 0,
    );
    const bps = apportion(10000, weights);
    const amounts = splitAmount({
      amountInCents: toCents(e.amountInCents),
      payerMemberId: e.payerMemberId as string,
      shares: weights.map((w) => ({
        memberId: w.key,
        bps: bps[w.key] as number,
        ordinal: w.ordinal,
        weight: w.weight,
      })),
    });
    await tx.$executeRaw`UPDATE transactions SET "splitMode" = 'RULE', "splitRuleVersionId" = ${rule.id}::uuid WHERE id = ${e.id}::uuid`;
    await tx.transactionSplit.createMany({
      data: weights.map((w) => ({
        transactionId: e.id,
        familyId,
        memberId: w.key,
        bps: bps[w.key] as number,
        amountInCents: fromCents(amounts[w.key] as number),
      })),
    });
    splitRows += weights.length;
  }

  // 4) virar a chave (dentro da MESMA transação: o carregador de produção passa a ler o rateio) e comparar
  await tx.$executeRaw`UPDATE families SET "splitEngine" = 'STORED' WHERE id = ${familyId}::uuid`;
  for (const key of keys) {
    const after = await snapshotPeriod(tx, ctx, key, opts.today);
    const diffs = diffSnapshots(before.get(key) as PeriodSnapshot, after);
    const first = diffs[0];
    if (first) throw new GateError(familyId, key, first.field, first.expected, first.actual);
  }

  const personal = await tx.transaction.count({
    where: { familyId, kind: "EXPENSE", isSharedExpense: false },
  });
  const report: MigrationReport = {
    familyId,
    status: "DONE",
    periods: keys.length,
    activeExpenses: activeCount,
    deletedExpenses: deleted.length,
    personalExpenses: personal,
    splitRows,
  };
  if (opts.dryRun) throw new DryRunRollback(report);

  // 5) registrar
  await tx.dataMigration.upsert({
    where: { name_familyId: { name: MIGRATION_NAME, familyId } },
    update: { state: "DONE", finishedAt: new Date(), report },
    create: { name: MIGRATION_NAME, familyId, state: "DONE", finishedAt: new Date(), report },
  });
  return report;
}

/** Grava `splitMode = RULE`, a regra de origem e as linhas do rateio (SQL cru para não tocar updatedAt/version). */
async function persistAllocation(
  tx: Tx,
  familyId: string,
  alloc: ReturnType<typeof allocateBackfill>,
): Promise<number> {
  let n = 0;
  const byRule = new Map<string, string[]>();
  for (const row of alloc) {
    const ids = byRule.get(row.ruleVersionId) ?? [];
    ids.push(row.expenseId);
    byRule.set(row.ruleVersionId, ids);
  }
  for (const [ruleId, ids] of byRule) {
    await tx.$executeRaw`UPDATE transactions SET "splitMode" = 'RULE', "splitRuleVersionId" = ${ruleId}::uuid
      WHERE "familyId" = ${familyId}::uuid AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  }
  for (const row of alloc) {
    await tx.transactionSplit.createMany({
      data: row.shares.map((s) => ({
        transactionId: row.expenseId,
        familyId,
        memberId: s.memberId,
        bps: s.bps,
        amountInCents: fromCents(s.amountInCents),
      })),
    });
    n += row.shares.length;
  }
  return n;
}

// ── Reversão (ADR-021 §4) e verificação (SDD-015 §4.8) ──

/** Nível 1: volta o motor a LEGACY sem tocar nos dados (as linhas de rateio são aditivas). */
export async function rollbackEngine(
  tx: Tx,
  familyId: string,
  opts: { purge?: boolean } = {},
): Promise<{ purged: boolean }> {
  const locked = await tx.$queryRaw<
    Array<{ splitEngine: string }>
  >`SELECT "splitEngine" FROM families WHERE id = ${familyId}::uuid FOR UPDATE`;
  if (!locked[0]) throw new Error(`Família ${familyId} não encontrada`);
  if (opts.purge) {
    // Nível 2: só antes da migração de contrato e sem CUSTOM/parcela dividida
    const custom = await tx.transaction.count({ where: { familyId, splitMode: "CUSTOM" } });
    const splitParcels = await tx.transaction.count({
      where: { familyId, installmentPlanId: { not: null }, splitMode: { not: "NONE" } },
    });
    const contract = await tx.$queryRaw<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'tx_shared_mode_chk'`;
    if (custom > 0 || splitParcels > 0 || (contract[0]?.n ?? 0) > 0) {
      throw new RollbackRefused(
        custom > 0
          ? "há lançamentos CUSTOM"
          : splitParcels > 0
            ? "há parcela dividida"
            : "a migração de contrato já foi aplicada",
      );
    }
  }
  await tx.$executeRaw`UPDATE families SET "splitEngine" = 'LEGACY' WHERE id = ${familyId}::uuid`;
  if (opts.purge) {
    await tx.transactionSplit.deleteMany({ where: { familyId } });
    await tx.$executeRaw`UPDATE transactions SET "splitMode" = 'NONE', "splitRuleVersionId" = NULL WHERE "familyId" = ${familyId}::uuid AND "splitMode" <> 'NONE'`;
  }
  await tx.dataMigration.upsert({
    where: { name_familyId: { name: MIGRATION_NAME, familyId } },
    update: { state: "ROLLED_BACK", finishedAt: new Date() },
    create: { name: MIGRATION_NAME, familyId, state: "ROLLED_BACK", finishedAt: new Date() },
  });
  return { purged: opts.purge === true };
}

export class RollbackRefused extends Error {
  constructor(readonly reason: string) {
    super(`reversão recusada: ${reason}`);
    this.name = "RollbackRefused";
  }
}

export type VerifyProblem = { familyId: string; problem: string; detail?: string };

/** Integridade (não compara números): ver SDD-015 §4.8. */
export async function verifySplit(tx: Tx, familyId?: string): Promise<VerifyProblem[]> {
  const out: VerifyProblem[] = [];
  const families = await tx.family.findMany({
    where: familyId ? { id: familyId } : {},
    select: { id: true, splitEngine: true },
  });
  for (const f of families) {
    if (f.splitEngine === "STORED") {
      const dm = await tx.dataMigration.findUnique({
        where: { name_familyId: { name: MIGRATION_NAME, familyId: f.id } },
      });
      if (dm?.state !== "DONE")
        out.push({ familyId: f.id, problem: "família STORED sem data_migrations DONE" });
      const missing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT t.id FROM transactions t
        WHERE t."familyId" = ${f.id}::uuid AND t.kind = 'EXPENSE' AND t."isSharedExpense" = true
          AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s."transactionId" = t.id)
        LIMIT 5`;
      for (const m of missing)
        out.push({ familyId: f.id, problem: "despesa comum sem rateio", detail: m.id });
    }
    const bad = await tx.$queryRaw<Array<{ id: string; sb: bigint; sa: bigint; amt: bigint }>>`
      SELECT t.id, SUM(s.bps)::bigint AS sb, SUM(s."amountInCents")::bigint AS sa, t."amountInCents" AS amt
      FROM transactions t JOIN transaction_splits s ON s."transactionId" = t.id
      WHERE t."familyId" = ${f.id}::uuid
      GROUP BY t.id, t."amountInCents" HAVING SUM(s.bps) <> 10000 OR SUM(s."amountInCents") <> t."amountInCents" LIMIT 5`;
    for (const b of bad)
      out.push({
        familyId: f.id,
        problem: "Σ bps ou Σ valores diverge do lançamento",
        detail: b.id,
      });
    const orphan = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT t.id FROM transactions t JOIN transaction_splits s ON s."transactionId" = t.id
      WHERE t."familyId" = ${f.id}::uuid AND (t."splitMode" = 'NONE' OR t.kind <> 'EXPENSE') GROUP BY t.id LIMIT 5`;
    for (const o of orphan)
      out.push({
        familyId: f.id,
        problem: "rateio em lançamento NONE ou que não é despesa",
        detail: o.id,
      });
  }
  return out;
}
