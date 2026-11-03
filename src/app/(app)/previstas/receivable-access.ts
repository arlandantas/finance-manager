"use client";

import { useFamily } from "@/modules/familia/hooks";
import type { ReceivableItemDTO } from "@/modules/previstas/schemas";
import { canWritePlanned, effectiveOwner, isUnlinkedActive } from "@/modules/transacoes/ownership";

/** US-051: quem pode receber/editar/excluir uma receita prevista (as mesmas regras "Só meu" da prevista, SEC-026). */
export function useCanActOnReceivable(item: ReceivableItemDTO): boolean {
  const family = useFamily().data;
  return (
    family === undefined ||
    canWritePlanned(
      {
        isSharedExpense: item.isSharedExpense,
        responsibleMemberId: effectiveOwner(item.responsible).id ?? "",
        authorMemberId: item.authorId,
        accountOwnerMemberId: item.destinationAccountOwnerId ?? null,
      },
      { memberId: family.currentMemberId, role: family.currentRole },
      effectiveOwner(item.responsible).removed,
      isUnlinkedActive(item.responsible),
    )
  );
}
