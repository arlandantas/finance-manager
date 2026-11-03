import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import { notFutureFilter } from "@/modules/transacoes/ledger-where";

const loadInclude = {
  account: { select: { id: true, name: true, color: true, archivedAt: true, ownerMemberId: true } },
  card: { select: { id: true, name: true, color: true, archivedAt: true, ownerMemberId: true } },
  invoice: { select: { referenceMonth: true, closingDate: true, dueDate: true } },
  category: true,
  group: true,
  paidPlanned: { select: { id: true, kind: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } }, // US-045
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
        select: {
          id: true,
          name: true,
          color: true,
          closingDay: true,
          dueDay: true,
          limitInCents: true,
        },
      }),
    /**
     * Cartão para POSTAR uma compra: trava a linha (FOR SHARE) ANTES de ler os dias de fechamento e vencimento.
     * Sem isso, um PATCH do ciclo confirmado entre a leitura e `getOrCreateInvoice` gerava a 1ª fatura com as
     * datas do ciclo antigo. O PATCH pega FOR UPDATE e, depois, vê a fatura criada (CYCLE_LOCKED).
     */
    findCardForPosting: async (id: string) => {
      await tx.$executeRaw`SELECT 1 FROM credit_cards WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR SHARE`;
      return tx.creditCard.findFirst({
        where: { id, familyId },
        select: {
          id: true,
          name: true,
          color: true,
          closingDay: true,
          dueDay: true,
          limitInCents: true,
        },
      });
    },
    findAccount: (id: string) =>
      tx.bankAccount.findFirst({
        where: { id, familyId },
        select: { id: true, name: true, color: true },
      }),
    countMembers: () => tx.member.count({ where: { familyId, removedAt: null } }),
    /** Ativo: referência de pagador/responsável (ex-membro => INVALID_REFERENCE). */
    findMember: (id: string) =>
      tx.member.findFirst({ where: { id, familyId, removedAt: null }, include: { user: true } }),
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
    lastCardUsedBy: async (memberId: string, today: string): Promise<string | null> => {
      const last = await tx.transaction.findFirst({
        // ADR-020 §4: parcelas futuras não contam como "última compra"
        where: {
          familyId,
          authorMemberId: memberId,
          kind: "EXPENSE",
          deletedAt: null,
          ...notFutureFilter(today),
        },
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
      /** EN-002a: só famílias STORED gravam o modo e a regra de origem do rateio. */
      splitMode?: "NONE" | "RULE" | "CUSTOM";
      splitRuleVersionId?: string | null;
      /** US-076a: lançamento direto pelo assistente. */
      origin?: "APP" | "ASSISTANT";
      assistantGrantId?: string | null;
      assistantIdemKey?: string | null;
      createdAt?: Date;
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
          ...(d.splitMode ? { splitMode: d.splitMode } : {}),
          ...(d.splitRuleVersionId !== undefined
            ? { splitRuleVersionId: d.splitRuleVersionId }
            : {}),
          ...(d.origin ? { origin: d.origin } : {}),
          ...(d.assistantGrantId !== undefined ? { assistantGrantId: d.assistantGrantId } : {}),
          ...(d.assistantIdemKey !== undefined ? { assistantIdemKey: d.assistantIdemKey } : {}),
          ...(d.createdAt ? { createdAt: d.createdAt } : {}),
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
        splitMode?: "NONE" | "RULE" | "CUSTOM";
        splitRuleVersionId?: string | null;
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
          ...(data.splitMode !== undefined ? { splitMode: data.splitMode } : {}),
          ...(data.splitRuleVersionId !== undefined
            ? { splitRuleVersionId: data.splitRuleVersionId }
            : {}),
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
