import { ApiError } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { assertCanWriteTransaction } from "@/modules/transacoes/ownership";

/**
 * US-098: `canEdit` do DTO = mesmo predicado da US-097 (ativa + controle "Só meu" da compra no cartão).
 * Só informa a UI; o servidor continua recusando a escrita (403) em `PATCH`/`end`.
 */
export async function canEditSubscription(
  tx: Tx,
  ctx: RequestContext,
  row: {
    endedAt: Date | null;
    isSharedExpense: boolean;
    payerMemberId: string;
    authorMemberId: string;
    cardId: string;
  },
): Promise<boolean> {
  if (row.endedAt) return false;
  try {
    await assertCanWriteTransaction(tx, ctx, {
      kind: "EXPENSE",
      isSharedExpense: row.isSharedExpense,
      payerMemberId: row.payerMemberId,
      authorMemberId: row.authorMemberId,
      cardId: row.cardId,
    });
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return false;
    throw e;
  }
}
