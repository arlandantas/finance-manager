import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";

const loadInclude = {
  account: { select: { id: true, name: true, archivedAt: true } },
  card: { select: { id: true, name: true, archivedAt: true } },
  invoice: { select: { referenceMonth: true, closingDate: true, dueDate: true } },
  category: true,
  group: true,
  paidPlanned: { select: { id: true } },
} as const;

/** Lançamentos e categorias sempre escopados por `familyId` (ADR-013). */
export function transacoesRepo(tx: Tx, familyId: string) {
  return {
    listCategories: (kind?: "EXPENSE" | "INCOME") =>
      tx.category.findMany({
        where: { familyId, archivedAt: null, ...(kind ? { kind } : {}) },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      }),
    listAllCategories: () => tx.category.findMany({ where: { familyId } }),
    findCategory: (id: string) =>
      tx.category.findFirst({ where: { id, familyId, archivedAt: null } }),
    /** Categoria da família ainda que arquivada (baixa de previsão, SDD-009). */
    findCategoryAny: (id: string) => tx.category.findFirst({ where: { id, familyId } }),
    findCard: (id: string) =>
      tx.creditCard.findFirst({
        where: { id, familyId },
        select: { id: true, name: true, closingDay: true, dueDay: true, limitInCents: true },
      }),
    findAccount: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId }, select: { id: true, name: true } }),
    countMembers: () => tx.member.count({ where: { familyId } }),
    findMember: (id: string) =>
      tx.member.findFirst({ where: { id, familyId }, include: { user: true } }),
    listMembers: () => tx.member.findMany({ where: { familyId }, include: { user: true } }),
    lastAccountUsedBy: async (memberId: string): Promise<string | null> => {
      const last = await tx.transaction.findFirst({
        where: {
          familyId,
          authorMemberId: memberId,
          kind: { in: ["EXPENSE", "INCOME"] },
          deletedAt: null,
          accountId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { accountId: true },
      });
      return last?.accountId ?? null;
    },
    /** Cartão da despesa mais recente do membro, se ela foi no cartão (SDD-008 §3.2). */
    lastCardUsedBy: async (memberId: string): Promise<string | null> => {
      const last = await tx.transaction.findFirst({
        where: { familyId, authorMemberId: memberId, kind: "EXPENSE", deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { cardId: true },
      });
      return last?.cardId ?? null;
    },
    ownedAccountId: async (memberId: string): Promise<string | null> => {
      const a = await tx.bankAccount.findFirst({
        where: { familyId, ownerMemberId: memberId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      return a?.id ?? null;
    },
    firstAccountId: async (): Promise<string | null> => {
      const a = await tx.bankAccount.findFirst({
        where: { familyId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      return a?.id ?? null;
    },
    cutDay: async (): Promise<number> =>
      (await tx.family.findFirst({ where: { id: familyId }, select: { cutDay: true } }))?.cutDay ??
      1,
    findByIds: (ids: string[]) =>
      tx.transaction.findMany({ where: { familyId, id: { in: ids } }, include: loadInclude }),
    findById: (id: string) =>
      tx.transaction.findFirst({ where: { id, familyId }, include: loadInclude }),
    /** Pernas "irmãs" de transferência (conta da outra ponta). */
    counterparts: (groupIds: string[]) =>
      tx.transaction.findMany({
        where: { familyId, transferGroupId: { in: groupIds } },
        select: {
          id: true,
          transferGroupId: true,
          accountId: true,
          account: { select: { id: true, name: true } },
        },
      }),
    /** Autor da última revisão UPDATE (para "Editado por"). */
    lastEditorId: async (transactionId: string): Promise<string | null> => {
      const rev = await tx.transactionRevision.findFirst({
        where: { familyId, transactionId, action: "UPDATE" },
        orderBy: [{ at: "desc" }],
        select: { actorMemberId: true },
      });
      return rev?.actorMemberId ?? null;
    },
    insert: (d: {
      kind: "EXPENSE" | "INCOME";
      direction: "CREDIT" | "DEBIT";
      accountId: string | null;
      cardId?: string | null;
      invoiceId?: string | null;
      categoryId: string;
      amountInCents: number;
      occurredOn: string;
      description: string;
      note: string | null;
      payerMemberId: string;
      authorMemberId: string;
      isSharedExpense: boolean;
    }) =>
      tx.transaction.create({
        data: {
          familyId,
          kind: d.kind,
          direction: d.direction,
          accountId: d.accountId,
          cardId: d.cardId ?? null,
          invoiceId: d.invoiceId ?? null,
          categoryId: d.categoryId,
          amountInCents: fromCents(d.amountInCents),
          occurredOn: toDbDate(d.occurredOn),
          description: d.description,
          note: d.note,
          payerMemberId: d.payerMemberId,
          authorMemberId: d.authorMemberId,
          isSharedExpense: d.isSharedExpense,
        },
      }),
    /** Atualização com controle otimista: 0 linhas => versão antiga, excluído ou inexistente. */
    updateVersioned: (
      id: string,
      version: number,
      data: {
        accountId?: string;
        invoiceId?: string;
        categoryId?: string;
        amountInCents?: number;
        occurredOn?: string;
        payerMemberId?: string;
        description?: string;
        note?: string | null;
        isSharedExpense?: boolean;
        updatedByMemberId: string;
      },
    ) =>
      tx.transaction.updateMany({
        where: { id, familyId, version, deletedAt: null },
        data: {
          ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
          ...(data.invoiceId !== undefined ? { invoiceId: data.invoiceId } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.amountInCents !== undefined
            ? { amountInCents: fromCents(data.amountInCents) }
            : {}),
          ...(data.occurredOn !== undefined ? { occurredOn: toDbDate(data.occurredOn) } : {}),
          ...(data.payerMemberId !== undefined ? { payerMemberId: data.payerMemberId } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.note !== undefined ? { note: data.note } : {}),
          ...(data.isSharedExpense !== undefined ? { isSharedExpense: data.isSharedExpense } : {}),
          updatedByMemberId: data.updatedByMemberId,
          version: { increment: 1 },
        },
      }),
    markDeleted: (id: string, version: number, memberId: string, now: Date) =>
      tx.transaction.updateMany({
        where: { id, familyId, version, deletedAt: null },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          deletionReason: "DELETED",
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    markRestored: (id: string, version: number, memberId: string) =>
      tx.transaction.updateMany({
        where: { id, familyId, version, deletedAt: { not: null }, deletionReason: "DELETED" },
        data: {
          deletedAt: null,
          deletedByMemberId: null,
          deletionReason: null,
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
    listRevisions: (transactionId: string) =>
      tx.transactionRevision.findMany({
        where: { familyId, transactionId },
        orderBy: [{ at: "desc" }, { revision: "desc" }],
      }),
  };
}
