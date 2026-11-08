import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { assertPersonalForSelf } from "@/modules/transacoes/ownership";
import type { ConfirmItem } from "./confirm-schema";

// Spec 13 regra 16: o servidor não confia no rascunho do cliente. Cada falha aponta o `idx` do item.

export const itemInvalid = (idx: number, field: string, message: string) =>
  unprocessable("IMPORT_ITEM_INVALID", message, { idx, field, message });

/** Categoria ativa de despesa e pagador ativo da própria família, data não futura; autoria como no lançamento manual. */
export async function validateItems(
  tx: Tx,
  ctx: RequestContext,
  items: readonly ConfirmItem[],
  today: string,
): Promise<void> {
  const [categories, members] = await Promise.all([
    tx.category.findMany({
      where: {
        familyId: ctx.familyId,
        id: { in: [...new Set(items.map((i) => i.categoryId))] },
        archivedAt: null,
        kind: "EXPENSE",
      },
      select: { id: true },
    }),
    tx.member.findMany({
      where: {
        familyId: ctx.familyId,
        id: { in: [...new Set(items.map((i) => i.payerMemberId))] },
        removedAt: null,
      },
      select: { id: true },
    }),
  ]);
  const okCategory = new Set(categories.map((c) => c.id));
  const okMember = new Set(members.map((m) => m.id));
  for (const i of items) {
    if (!okCategory.has(i.categoryId)) {
      throw itemInvalid(i.idx, "categoryId", "Escolha uma categoria de despesa.");
    }
    if (!okMember.has(i.payerMemberId))
      throw itemInvalid(i.idx, "payerMemberId", "Membro inválido.");
    if (i.date > today) throw itemInvalid(i.idx, "date", "A data da compra não pode ser futura.");
  }
  // SEC-026c / US-093b: "Só meu" em nome de outra pessoa só pelo Administrador, e só para dono sem conta
  for (const payerMemberId of new Set(items.map((i) => i.payerMemberId))) {
    await assertPersonalForSelf(tx, ctx, { isSharedExpense: false, payerMemberId });
  }
}
