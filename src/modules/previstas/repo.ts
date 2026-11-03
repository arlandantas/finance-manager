import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";

const include = {
  category: true,
  series: { select: { id: true, dayOfMonth: true } },
  paymentAccount: { select: { id: true, name: true, archivedAt: true, ownerMemberId: true } },
  paidTx: { include: { account: { select: { id: true, name: true, ownerMemberId: true } } } },
} as const;

/** Previstas sempre escopadas por `familyId` (ADR-013). */
export function previstasRepo(tx: Tx, familyId: string) {
  return {
    findById: (id: string) =>
      tx.plannedExpense.findFirst({ where: { id, familyId, deletedAt: null }, include }),
    /** `FOR UPDATE` na linha (SDD-009 §4.2/§4.3). */
    lock: async (id: string) => {
      await tx.$queryRaw`SELECT id FROM planned_expenses WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR UPDATE`;
    },
    listInRange: (
      start: string,
      end: string,
      status?: "PREVISTO" | "PAGO",
      kind: "EXPENSE" | "INCOME" | "ALL" = "EXPENSE",
    ) =>
      tx.plannedExpense.findMany({
        where: {
          familyId,
          deletedAt: null,
          dueOn: { gte: toDbDate(start), lte: toDbDate(end) },
          ...(status ? { status } : {}),
          ...(kind !== "ALL" ? { kind } : {}),
        },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    // US-051 (SDD-017 §4.5): "A pagar" é só despesa; a receita prevista tem `listOpenReceivable`
    listOpen: () =>
      tx.plannedExpense.findMany({
        where: { familyId, deletedAt: null, status: "PREVISTO", kind: "EXPENSE" },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    listOpenUntil: (until: string) =>
      tx.plannedExpense.findMany({
        where: {
          familyId,
          deletedAt: null,
          status: "PREVISTO",
          kind: "EXPENSE",
          dueOn: { lte: toDbDate(until) },
        },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    listOpenBefore: (before: string) =>
      tx.plannedExpense.findMany({
        where: {
          familyId,
          deletedAt: null,
          status: "PREVISTO",
          kind: "EXPENSE",
          dueOn: { lt: toDbDate(before) },
        },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    /** Receitas previstas pendentes (US-051): a base única de "A receber". */
    listOpenReceivable: () =>
      tx.plannedExpense.findMany({
        where: { familyId, deletedAt: null, status: "PREVISTO", kind: "INCOME" },
        include,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    insert: (d: {
      kind?: "EXPENSE" | "INCOME";
      description: string;
      amountInCents: number;
      dueOn: string;
      categoryId: string;
      responsibleMemberId: string;
      isSharedExpense: boolean;
      note: string | null;
      authorMemberId: string;
      paymentAccountId?: string | null;
    }) =>
      tx.plannedExpense.create({
        data: {
          familyId,
          ...d,
          kind: d.kind ?? "EXPENSE",
          amountInCents: fromCents(d.amountInCents),
          dueOn: toDbDate(d.dueOn),
        },
        include,
      }),
    updateVersioned: (
      id: string,
      version: number,
      d: {
        description?: string;
        amountInCents?: number;
        dueOn?: string;
        categoryId?: string;
        responsibleMemberId?: string;
        isSharedExpense?: boolean;
        note?: string | null;
        paymentAccountId?: string | null;
        isException?: boolean;
        updatedByMemberId: string;
      },
    ) =>
      tx.plannedExpense.updateMany({
        where: { id, familyId, version, deletedAt: null },
        data: {
          ...(d.description !== undefined ? { description: d.description } : {}),
          ...(d.amountInCents !== undefined ? { amountInCents: fromCents(d.amountInCents) } : {}),
          ...(d.dueOn !== undefined ? { dueOn: toDbDate(d.dueOn) } : {}),
          ...(d.categoryId !== undefined ? { categoryId: d.categoryId } : {}),
          ...(d.responsibleMemberId !== undefined
            ? { responsibleMemberId: d.responsibleMemberId }
            : {}),
          ...(d.isSharedExpense !== undefined ? { isSharedExpense: d.isSharedExpense } : {}),
          ...(d.note !== undefined ? { note: d.note } : {}),
          ...(d.paymentAccountId !== undefined ? { paymentAccountId: d.paymentAccountId } : {}),
          ...(d.isException !== undefined ? { isException: d.isException } : {}),
          updatedByMemberId: d.updatedByMemberId,
          version: { increment: 1 },
        },
      }),
    markDeleted: (id: string, version: number, memberId: string, now: Date) =>
      tx.plannedExpense.updateMany({
        where: { id, familyId, version, deletedAt: null, status: "PREVISTO" },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    markPaid: (id: string, version: number, transactionId: string, memberId: string) =>
      tx.plannedExpense.updateMany({
        where: { id, familyId, version, status: "PREVISTO", deletedAt: null },
        data: {
          status: "PAGO",
          paidTransactionId: transactionId,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    markUnpaid: (id: string, version: number, memberId: string) =>
      tx.plannedExpense.updateMany({
        where: { id, familyId, version, status: "PAGO", deletedAt: null },
        data: {
          status: "PREVISTO",
          paidTransactionId: null,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    /** Conta bancária ativa (US-059): da família, não excluída, não arquivada. */
    findActiveAccount: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId, deletedAt: null, archivedAt: null } }),
    findCategory: (id: string) => tx.category.findFirst({ where: { id, familyId } }),
    /** Ativo (referência de responsável). */
    findMember: (id: string) =>
      tx.member.findFirst({ where: { id, familyId, removedAt: null }, include: { user: true } }),
    /** Todos (nomes no histórico, inclusive ex-membros). */
    listMembers: () => tx.member.findMany({ where: { familyId }, include: { user: true } }),
    cutDay: async (): Promise<number> =>
      (await tx.family.findFirst({ where: { id: familyId }, select: { cutDay: true } }))?.cutDay ??
      1,
  };
}
