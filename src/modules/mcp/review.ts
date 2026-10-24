import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";

// SDD-027 §R2.5: cartão de conferência da Home — lançamentos do próprio membro feitos pelo assistente
// depois da última conferência (máx. 7 dias). Excluídos saem da contagem; "Desfazer" os traz de volta.
export const REVIEW_WINDOW_DAYS = 7;
export const REVIEW_SHOWN = 3;

export type AssistantReviewDTO = {
  count: number;
  items: Array<{
    id: string;
    description: string;
    amountInCents: number;
    source: string;
    occurredOn: string;
    createdAt: string;
    version: number;
  }>;
};

export async function getAssistantReview(tx: Tx, ctx: RequestContext): Promise<AssistantReviewDTO> {
  const me = await tx.member.findFirst({
    where: { id: ctx.memberId, familyId: ctx.familyId },
    select: { assistantReviewedAt: true },
  });
  const since = new Date(ctx.clock.now().getTime() - REVIEW_WINDOW_DAYS * 86_400_000);
  const after =
    me?.assistantReviewedAt && me.assistantReviewedAt > since ? me.assistantReviewedAt : since;
  const where = {
    familyId: ctx.familyId,
    authorMemberId: ctx.memberId,
    origin: "ASSISTANT" as const,
    deletedAt: null,
    createdAt: { gt: after, lte: ctx.clock.now() },
  };
  const [count, rows] = await Promise.all([
    tx.transaction.count({ where }),
    tx.transaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: REVIEW_SHOWN,
      include: { account: { select: { name: true } }, card: { select: { name: true } } },
    }),
  ]);
  return {
    count,
    items: rows.map((t) => ({
      id: t.id,
      description: t.description,
      amountInCents: toCents(t.amountInCents),
      source: t.card?.name ?? t.account?.name ?? "",
      occurredOn: fromDbDate(t.occurredOn),
      createdAt: t.createdAt.toISOString(),
      version: t.version,
    })),
  };
}

/** POST /assistant/reviewed — "Marcar como conferidos" (idempotente). */
export async function markAssistantReviewed(
  tx: Tx,
  ctx: RequestContext,
): Promise<AssistantReviewDTO> {
  await tx.member.updateMany({
    where: { id: ctx.memberId, familyId: ctx.familyId },
    data: { assistantReviewedAt: ctx.clock.now() },
  });
  return getAssistantReview(tx, ctx);
}
