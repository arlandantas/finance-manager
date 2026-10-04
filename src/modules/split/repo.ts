import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";

/** Regra de divisão, despesas comuns e acertos sempre escopados por `familyId` (ADR-013). */
export function splitRepo(tx: Tx, familyId: string) {
  return {
    cutDay: async (): Promise<number> =>
      (await tx.family.findFirst({ where: { id: familyId }, select: { cutDay: true } }))?.cutDay ??
      1,
    listMembers: () =>
      tx.member.findMany({
        where: { familyId },
        include: { user: true },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      }),
    listRules: () =>
      tx.splitRuleVersion.findMany({
        where: { familyId },
        include: { shares: true },
        orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    insertRule: (d: {
      kind: "EQUAL" | "PROPORTIONAL";
      effectiveFrom: string;
      createdByMemberId: string;
      shares: Array<{ memberId: string; bps: number }>;
    }) =>
      tx.splitRuleVersion.create({
        data: {
          familyId,
          kind: d.kind,
          effectiveFrom: toDbDate(d.effectiveFrom),
          createdByMemberId: d.createdByMemberId,
          ...(d.kind === "PROPORTIONAL" ? { shares: { create: d.shares } } : {}),
        },
        include: { shares: true },
      }),
    /** SDD-002 §5.1: só `EXPENSE` comum ativa. Nunca TRANSFER_*, OPENING ou INCOME. */
    sharedExpenses: (start: string, end: string) =>
      tx.transaction.findMany({
        where: {
          familyId,
          kind: "EXPENSE",
          isSharedExpense: true,
          deletedAt: null,
          occurredOn: { gte: toDbDate(start), lte: toDbDate(end) },
        },
        include: { category: true },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      }),
    /** SDD-002 §5.2: acertos ativos do período com as pernas e contas. */
    activeSettlements: (periodKey: string) =>
      tx.transferGroup.findMany({
        where: { familyId, kind: "SETTLEMENT", settlementPeriod: periodKey, deletedAt: null },
        include: { legs: { include: { account: { select: { id: true, name: true } } } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    /** `isSettledPeriod` (SDD-002 §4.5). */
    hasActiveSettlement: async (periodKey: string): Promise<boolean> =>
      (await tx.transferGroup.count({
        where: { familyId, kind: "SETTLEMENT", settlementPeriod: periodKey, deletedAt: null },
      })) > 0,
    /** Trava por (família, período) até o fim da transação (SDD-002 §5.4, passo 3). */
    lockPeriod: async (periodKey: string): Promise<void> => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${familyId}:${periodKey}`}, 0))`,
      );
    },
    findAccount: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId }, select: { id: true, name: true } }),
  };
}
