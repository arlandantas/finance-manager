import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";

/** Lançamentos e categorias sempre escopados por `familyId` (ADR-013). */
export function transacoesRepo(tx: Tx, familyId: string) {
  return {
    listCategories: (kind?: "EXPENSE" | "INCOME") =>
      tx.category.findMany({
        where: { familyId, archivedAt: null, ...(kind ? { kind } : {}) },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      }),
    findCategory: (id: string) =>
      tx.category.findFirst({ where: { id, familyId, archivedAt: null } }),
    findAccount: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId }, select: { id: true, name: true } }),
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
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { accountId: true },
      });
      return last?.accountId ?? null;
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
      tx.transaction.findMany({
        where: { familyId, id: { in: ids } },
        include: { account: { select: { id: true, name: true } }, category: true, group: true },
      }),
    findById: (id: string) =>
      tx.transaction.findFirst({
        where: { id, familyId },
        include: { account: { select: { id: true, name: true } }, category: true, group: true },
      }),
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
      accountId: string;
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
  };
}
