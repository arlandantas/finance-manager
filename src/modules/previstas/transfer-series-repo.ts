import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import type { MonthISO } from "@/modules/previstas/recurrence";

const include = {
  fromAccount: { select: { id: true, name: true, archivedAt: true } },
  toAccount: { select: { id: true, name: true, archivedAt: true } },
} as const;
const dbMonth = (m: MonthISO | string) => toDbDate(`${m}-01`);

export type SeriesFields = {
  fromAccountId: string;
  toAccountId: string;
  amountInCents: number;
  description: string | null;
  dayOfMonth: number;
  endMonth: MonthISO | null;
};

/** Séries de transferência sempre escopadas por `familyId` (ADR-013). */
export function transferSeriesRepo(tx: Tx, familyId: string) {
  return {
    /** Mesma trava consultiva da recorrência de despesas (geração preguiçosa e edição serializam). */
    lockFamily: async () => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurrence:${familyId}`}))`;
    },
    findById: (id: string) => tx.recurringTransfer.findFirst({ where: { id, familyId }, include }),
    listActive: () =>
      tx.recurringTransfer.findMany({
        where: { familyId, endedAt: null },
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    /** Atalho barato: séries ativas com horizonte incompleto e as duas contas ativas (defesa). */
    pendingSeriesIds: async (targetMonth: MonthISO): Promise<string[]> => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT s.id FROM recurring_transfers s
        WHERE s."familyId" = ${familyId}::uuid AND s."endedAt" IS NULL
          AND (s."generatedThroughMonth" IS NULL
            OR s."generatedThroughMonth" < LEAST(s."endMonth", ${`${targetMonth}-01`}::date))
          AND NOT EXISTS (
            SELECT 1 FROM bank_accounts a
            WHERE a."familyId" = s."familyId" AND a.id IN (s."fromAccountId", s."toAccountId")
              AND (a."archivedAt" IS NOT NULL OR a."deletedAt" IS NOT NULL))`;
      return rows.map((r) => r.id);
    },
    findManyByIds: (ids: string[]) =>
      tx.recurringTransfer.findMany({
        where: { familyId, id: { in: ids } },
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    insert: (d: SeriesFields & { startMonth: MonthISO; authorMemberId: string }) =>
      tx.recurringTransfer.create({
        data: {
          familyId,
          ...d,
          amountInCents: fromCents(d.amountInCents),
          startMonth: dbMonth(d.startMonth),
          endMonth: d.endMonth ? dbMonth(d.endMonth) : null,
        },
        include,
      }),
    updateVersioned: (
      id: string,
      version: number,
      d: SeriesFields & { updatedByMemberId: string },
    ) =>
      tx.recurringTransfer.updateMany({
        where: { id, familyId, version, endedAt: null },
        data: {
          ...d,
          amountInCents: fromCents(d.amountInCents),
          endMonth: d.endMonth ? dbMonth(d.endMonth) : null,
          version: { increment: 1 },
        },
      }),
    markEnded: (id: string, version: number, memberId: string, now: Date) =>
      tx.recurringTransfer.updateMany({
        where: { id, familyId, version, endedAt: null },
        data: {
          endedAt: now,
          endedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    setGeneratedThrough: (id: string, month: MonthISO) =>
      tx.recurringTransfer.updateMany({
        where: { id, familyId },
        data: { generatedThroughMonth: dbMonth(month) },
      }),
    /** `ON CONFLICT DO NOTHING` na unique (familyId, seriesId, occurrenceMonth). */
    insertOccurrences: (
      rows: Array<{
        seriesId: string;
        occurrenceMonth: MonthISO;
        dueOn: string;
        fromAccountId: string;
        toAccountId: string;
        amountInCents: number;
        description: string | null;
        authorMemberId: string;
      }>,
    ) =>
      tx.plannedTransfer.createMany({
        skipDuplicates: true,
        data: rows.map((r) => ({
          familyId,
          seriesId: r.seriesId,
          occurrenceMonth: dbMonth(r.occurrenceMonth),
          dueOn: toDbDate(r.dueOn),
          fromAccountId: r.fromAccountId,
          toAccountId: r.toAccountId,
          amountInCents: fromCents(r.amountInCents),
          description: r.description,
          authorMemberId: r.authorMemberId,
        })),
      }),
    /** Pendentes (não excluídas) de um mês em diante e vencimento >= data, travadas `FOR UPDATE` em ordem de id. */
    lockPendingOccurrences: async (seriesId: string, fromMonth: MonthISO, fromDate: string) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM planned_transfers
        WHERE "familyId" = ${familyId}::uuid AND "seriesId" = ${seriesId}::uuid
          AND status = 'PREVISTA' AND "deletedAt" IS NULL
          AND "occurrenceMonth" >= ${`${fromMonth}-01`}::date AND "dueOn" >= ${fromDate}::date
        ORDER BY id FOR UPDATE`;
      return tx.plannedTransfer.findMany({
        where: { familyId, id: { in: ids.map((r) => r.id) }, status: "PREVISTA", deletedAt: null },
        orderBy: [{ occurrenceMonth: "asc" }],
      });
    },
    countRealizedFrom: (seriesId: string, fromMonth: MonthISO) =>
      tx.plannedTransfer.count({
        where: {
          familyId,
          seriesId,
          status: "EFETIVADA",
          occurrenceMonth: { gte: dbMonth(fromMonth) },
        },
      }),
    rewriteOccurrence: (
      id: string,
      d: {
        dueOn: string;
        fromAccountId: string;
        toAccountId: string;
        amountInCents: number;
        description: string | null;
        updatedByMemberId: string;
      },
    ) =>
      tx.plannedTransfer.updateMany({
        where: { id, familyId, status: "PREVISTA", deletedAt: null },
        data: {
          ...d,
          amountInCents: fromCents(d.amountInCents),
          dueOn: toDbDate(d.dueOn),
          version: { increment: 1 },
        },
      }),
    softDeleteOccurrences: (ids: string[], memberId: string, now: Date) =>
      tx.plannedTransfer.updateMany({
        where: { id: { in: ids }, familyId, status: "PREVISTA", deletedAt: null },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    accountsByIds: (ids: string[]) =>
      tx.bankAccount.findMany({
        where: { familyId, id: { in: ids }, deletedAt: null, archivedAt: null },
        select: { id: true },
      }),
  };
}
