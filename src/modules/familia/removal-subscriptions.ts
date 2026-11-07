import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

// US-096b (ADR-036, spec 12 regra 8): remoção de membro e assinaturas no cartão.

/** Assinaturas ativas em que o membro é o pagador (viram do destino das previstas). */
export const activeSubscriptionsOf = (tx: Tx, familyId: string, memberId: string) =>
  tx.cardSubscription.findMany({
    where: { familyId, payerMemberId: memberId, endedAt: null },
    select: { id: true, description: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

/** Ids dos cartões que têm assinatura ativa (cartão assim exige reatribuir, nunca arquivar em silêncio). */
export async function cardIdsWithSubscriptions(
  tx: Tx,
  familyId: string,
  cardIds: string[],
): Promise<Set<string>> {
  if (cardIds.length === 0) return new Set();
  const rows = await tx.cardSubscription.findMany({
    where: { familyId, cardId: { in: cardIds }, endedAt: null },
    select: { cardId: true },
    distinct: ["cardId"],
  });
  return new Set(rows.map((r) => r.cardId));
}

/** Com o cartão já `FOR UPDATE`: assinatura criada após a leitura da revisão ainda impede o arquivamento. */
export async function assertCardHasNoSubscriptions(tx: Tx, familyId: string, cardId: string) {
  if ((await cardIdsWithSubscriptions(tx, familyId, [cardId])).size > 0) {
    throw unprocessable(
      "REMOVAL_BLOCKED",
      "Uma assinatura foi cadastrada. Revise e tente de novo.",
      {
        blockers: [{ code: "CARD_NEEDS_OWNER", ids: [cardId] }],
      },
    );
  }
}

/** Passa as assinaturas ativas do removido a `to` (por pagador, não por ids lidos antes: pega as recém-criadas). */
export async function reassignPayerSubscriptions(
  tx: Tx,
  ctx: RequestContext,
  fromMemberId: string,
  to: string | undefined,
): Promise<number> {
  const where = { familyId: ctx.familyId, payerMemberId: fromMemberId, endedAt: null };
  if (to === undefined) {
    if ((await tx.cardSubscription.count({ where })) > 0) {
      throw unprocessable("REMOVAL_BLOCKED", "Escolha quem passa a pagar as assinaturas.", {
        blockers: [{ code: "INVALID_REASSIGN_TARGET" }],
      });
    }
    return 0;
  }
  const res = await tx.cardSubscription.updateMany({
    where,
    data: { payerMemberId: to, version: { increment: 1 } },
  });
  return res.count;
}
