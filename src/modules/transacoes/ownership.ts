import { forbidden } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

// SEC-021 (D-GES-42, DEV-88): lançamento "Só meu" só é alterado (editar, excluir, restaurar, estornar)
// pelo seu DONO. Os demais membros continuam vendo o lançamento, sem ações de escrita.
//
// Definição conservadora (hipótese do Dev, a ratificar):
//  - "Só meu" = DESPESA (`EXPENSE`) com `isSharedExpense = false`. Receita, transferência, acerto e
//    pagamento de fatura não têm o rótulo "Só meu" e seguem como estão.
//  - dono = quem PAGOU (`payerMemberId`); sem pagador, o autor do cadastro.
//  - dono que saiu da família ⇒ lançamento somente leitura para todos (D-PO-92).
//  - quem não pagou não converte despesa dividida em "Só meu" (assertCanMakePersonal).

export const PERSONAL_OWNER_ONLY_CODE = "PERSONAL_OWNER_ONLY";
export const PERSONAL_OWNER_ONLY_MESSAGE =
  'Este lançamento é "Só meu" de outra pessoa. Só quem pagou pode alterá-lo.';

export type OwnershipRow = {
  kind: string;
  isSharedExpense: boolean;
  payerMemberId: string | null;
  authorMemberId: string;
};

export const isPersonalExpense = (row: Pick<OwnershipRow, "kind" | "isSharedExpense">): boolean =>
  row.kind === "EXPENSE" && !row.isSharedExpense;

export const personalOwnerId = (row: Pick<OwnershipRow, "payerMemberId" | "authorMemberId">) =>
  row.payerMemberId ?? row.authorMemberId;

/** Regra pura (usada também pela UI): `ownerRemoved` = o dono já saiu da família (somente leitura). */
export function canWriteTransaction(
  row: OwnershipRow,
  viewer: { memberId: string; role: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
): boolean {
  if (!isPersonalExpense(row)) return true;
  return personalOwnerId(row) === viewer.memberId && !ownerRemoved;
}

/** Recusa (403) a escrita de quem não é o dono de um lançamento "Só meu". */
export async function assertCanWriteTransaction(
  tx: Tx,
  ctx: RequestContext,
  row: OwnershipRow,
): Promise<void> {
  if (!isPersonalExpense(row)) return;
  const ownerId = personalOwnerId(row);
  if (ownerId === ctx.memberId) return;
  const owner = await tx.member.findFirst({
    where: { id: ownerId, familyId: ctx.familyId },
    select: { removedAt: true },
  });
  if (canWriteTransaction(row, ctx, owner?.removedAt != null)) return;
  throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
}

/** D-PO-92: só quem pagou torna uma despesa dividida "Só meu". */
export function assertCanMakePersonal(
  ctx: RequestContext,
  current: OwnershipRow,
  next: { isSharedExpense?: boolean | undefined; payerMemberId?: string | undefined },
): void {
  if (current.kind !== "EXPENSE" || !current.isSharedExpense || next.isSharedExpense !== false) {
    return;
  }
  const payer = next.payerMemberId ?? current.payerMemberId ?? current.authorMemberId;
  if (payer !== ctx.memberId) {
    throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
}
