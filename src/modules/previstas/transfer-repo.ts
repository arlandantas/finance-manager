import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";

const include = {
  fromAccount: { select: { id: true, name: true, archivedAt: true } },
  toAccount: { select: { id: true, name: true, archivedAt: true } },
} as const;

/** Transferências previstas sempre escopadas por `familyId` (ADR-013). */
export function plannedTransfersRepo(tx: Tx, familyId: string) {
  return {
    findById: (id: string) =>
      tx.plannedTransfer.findFirst({ where: { id, familyId, deletedAt: null }, include }),
    /** `FOR UPDATE` na linha: primeira trava depois de `lockFamilySplit` (ADR-037 §2). */
    lock: async (id: string) => {
      await tx.$queryRaw`SELECT id FROM planned_transfers WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR UPDATE`;
    },
    list: (status?: "PREVISTA" | "EFETIVADA", range?: { start: string; end: string }) =>
      tx.plannedTransfer.findMany({
        where: {
          familyId,
          deletedAt: null,
          ...(status ? { status } : {}),
          ...(range ? { dueOn: { gte: toDbDate(range.start), lte: toDbDate(range.end) } } : {}),
        },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    insert: (d: {
      fromAccountId: string;
      toAccountId: string;
      amountInCents: number;
      dueOn: string;
      description: string | null;
      authorMemberId: string;
    }) =>
      tx.plannedTransfer.create({
        data: {
          familyId,
          ...d,
          amountInCents: fromCents(d.amountInCents),
          dueOn: toDbDate(d.dueOn),
        },
        include,
      }),
    updateVersioned: (
      id: string,
      version: number,
      d: {
        fromAccountId?: string;
        toAccountId?: string;
        amountInCents?: number;
        dueOn?: string;
        description?: string | null;
        isException?: true;
        updatedByMemberId: string;
      },
    ) =>
      tx.plannedTransfer.updateMany({
        where: { id, familyId, version, deletedAt: null, status: "PREVISTA" },
        data: {
          ...(d.isException ? { isException: true } : {}),
          ...(d.fromAccountId !== undefined ? { fromAccountId: d.fromAccountId } : {}),
          ...(d.toAccountId !== undefined ? { toAccountId: d.toAccountId } : {}),
          ...(d.amountInCents !== undefined ? { amountInCents: fromCents(d.amountInCents) } : {}),
          ...(d.dueOn !== undefined ? { dueOn: toDbDate(d.dueOn) } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
          updatedByMemberId: d.updatedByMemberId,
          version: { increment: 1 },
        },
      }),
    markDeleted: (id: string, version: number, memberId: string, now: Date) =>
      tx.plannedTransfer.updateMany({
        where: { id, familyId, version, deletedAt: null, status: "PREVISTA" },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    markRealized: (id: string, version: number, transferGroupId: string, memberId: string) =>
      tx.plannedTransfer.updateMany({
        where: { id, familyId, version, deletedAt: null, status: "PREVISTA" },
        data: {
          status: "EFETIVADA",
          transferGroupId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    /** Desfazer a transferência real devolve a prevista (mesma transação). */
    reopenByGroup: (transferGroupId: string, memberId: string) =>
      tx.plannedTransfer.updateMany({
        where: { familyId, transferGroupId, status: "EFETIVADA" },
        data: {
          status: "PREVISTA",
          transferGroupId: null,
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
