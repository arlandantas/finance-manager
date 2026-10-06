import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import type { MonthISO } from "@/modules/previstas/recurrence";

const include = { category: true, paymentAccount: true } as const;
const dbMonth = (m: MonthISO | string) => toDbDate(`${m}-01`);

/** Séries sempre escopadas por `familyId` (ADR-013). */
export function recurringRepo(tx: Tx, familyId: string) {
  return {
    /** Trava consultiva por família (geração e edição da série usam a mesma). */
    lockFamily: async () => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurrence:${familyId}`}))`;
    },
    findById: (id: string) => tx.recurringExpense.findFirst({ where: { id, familyId }, include }),
    listActive: () =>
      tx.recurringExpense.findMany({
        where: { familyId, endedAt: null },
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    /** Atalho barato (ADR-025): séries ativas cujo horizonte ainda não foi totalmente gerado. */
    pendingSeriesIds: async (targetMonth: MonthISO): Promise<string[]> => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM recurring_expenses
        WHERE "familyId" = ${familyId}::uuid AND "endedAt" IS NULL
          AND ("generatedThroughMonth" IS NULL
            OR "generatedThroughMonth" < LEAST("endMonth", ${`${targetMonth}-01`}::date))`;
      return rows.map((r) => r.id);
    },
    findManyByIds: (ids: string[]) =>
      tx.recurringExpense.findMany({
        where: { familyId, id: { in: ids } },
        include,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    insert: (d: {
      description: string;
      amountInCents: number;
      categoryId: string;
      responsibleMemberId: string;
      isSharedExpense: boolean;
      paymentAccountId: string | null;
      dayOfMonth: number;
      startMonth: MonthISO;
      endMonth: MonthISO | null;
      authorMemberId: string;
    }) =>
      tx.recurringExpense.create({
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
      d: {
        description: string;
        amountInCents: number;
        categoryId: string;
        responsibleMemberId: string;
        isSharedExpense: boolean;
        paymentAccountId: string | null;
        dayOfMonth: number;
        endMonth: MonthISO | null;
        updatedByMemberId: string;
      },
    ) =>
      tx.recurringExpense.updateMany({
        where: { id, familyId, version, endedAt: null },
        data: {
          ...d,
          amountInCents: fromCents(d.amountInCents),
          endMonth: d.endMonth ? dbMonth(d.endMonth) : null,
          version: { increment: 1 },
        },
      }),
    markEnded: (id: string, version: number, memberId: string, now: Date) =>
      tx.recurringExpense.updateMany({
        where: { id, familyId, version, endedAt: null },
        data: {
          endedAt: now,
          endedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    setGeneratedThrough: (id: string, month: MonthISO) =>
      tx.recurringExpense.updateMany({
        where: { id, familyId },
        data: { generatedThroughMonth: dbMonth(month) },
      }),
    /** `ON CONFLICT DO NOTHING` na unique (familyId, seriesId, occurrenceMonth). */
    insertOccurrences: (
      rows: Array<{
        seriesId: string;
        occurrenceMonth: MonthISO;
        dueOn: string;
        description: string;
        amountInCents: number;
        categoryId: string;
        responsibleMemberId: string;
        isSharedExpense: boolean;
        paymentAccountId: string | null;
        authorMemberId: string;
      }>,
    ) =>
      tx.plannedExpense.createMany({
        skipDuplicates: true,
        data: rows.map((r) => ({
          familyId,
          seriesId: r.seriesId,
          occurrenceMonth: dbMonth(r.occurrenceMonth),
          dueOn: toDbDate(r.dueOn),
          description: r.description,
          amountInCents: fromCents(r.amountInCents),
          categoryId: r.categoryId,
          responsibleMemberId: r.responsibleMemberId,
          isSharedExpense: r.isSharedExpense,
          paymentAccountId: r.paymentAccountId,
          authorMemberId: r.authorMemberId,
        })),
      }),
    /** Ocorrências pendentes (não excluídas) de um mês em diante e vencimento >= data. */
    pendingOccurrences: (seriesId: string, fromMonth: MonthISO, fromDate: string) =>
      tx.plannedExpense.findMany({
        where: {
          familyId,
          seriesId,
          status: "PREVISTO",
          deletedAt: null,
          occurrenceMonth: { gte: dbMonth(fromMonth) },
          dueOn: { gte: toDbDate(fromDate) },
        },
        orderBy: [{ occurrenceMonth: "asc" }],
      }),
    countPaidFrom: (seriesId: string, fromMonth: MonthISO) =>
      tx.plannedExpense.count({
        where: {
          familyId,
          seriesId,
          status: "PAGO",
          deletedAt: null,
          occurrenceMonth: { gte: dbMonth(fromMonth) },
        },
      }),
    rewriteOccurrence: (
      id: string,
      d: {
        dueOn: string;
        description: string;
        amountInCents: number;
        categoryId: string;
        responsibleMemberId: string;
        isSharedExpense: boolean;
        paymentAccountId: string | null;
        updatedByMemberId: string;
      },
    ) =>
      tx.plannedExpense.updateMany({
        where: { id, familyId, status: "PREVISTO", deletedAt: null },
        data: {
          ...d,
          amountInCents: fromCents(d.amountInCents),
          dueOn: toDbDate(d.dueOn),
          version: { increment: 1 },
        },
      }),
    softDeleteOccurrences: (ids: string[], memberId: string, now: Date) =>
      tx.plannedExpense.updateMany({
        where: { id: { in: ids }, familyId, status: "PREVISTO", deletedAt: null },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    activeAccountIds: async (ids: string[]): Promise<Set<string>> => {
      if (ids.length === 0) return new Set();
      const rows = await tx.bankAccount.findMany({
        where: { familyId, id: { in: ids }, deletedAt: null, archivedAt: null },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    },
  };
}
