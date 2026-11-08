import type { Tx } from "@/lib/api/types";
import { periodFilter } from "@/modules/transacoes/ledger-where";

/** US-044: revisão de despesas "Só meu" do mês encerrado; sempre escopada por `familyId` (ADR-013). */
export function reviewRepo(tx: Tx, familyId: string) {
  return {
    /** EXPENSE ativas "Só meu", sem parcelas, no período (competência). Só leitura. */
    personalItems: (start: string, end: string) =>
      tx.transaction.findMany({
        where: {
          familyId,
          kind: "EXPENSE",
          splitMode: "NONE",
          isSharedExpense: false,
          installmentPlanId: null,
          deletedAt: null,
          ...periodFilter(start, end),
        },
        include: { category: true },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      }),
    isDismissed: async (periodKey: string): Promise<boolean> =>
      (await tx.settlementReviewDismissal.count({ where: { familyId, periodKey } })) > 0,
    /** Idempotente: repetir não duplica nem falha. */
    dismiss: async (periodKey: string, byMemberId: string): Promise<void> => {
      await tx.settlementReviewDismissal.createMany({
        data: [{ familyId, periodKey, byMemberId }],
        skipDuplicates: true,
      });
    },
  };
}
