import type { RequestContext, Tx } from "@/lib/api/types";
import { assinaturasRepo } from "@/modules/assinaturas/repo";
import type {
  ListSubscriptionsQuery,
  SubscriptionCardTotal,
  SubscriptionDTO,
  SubscriptionListResult,
} from "@/modules/assinaturas/schemas";
import { toDTOs } from "@/modules/assinaturas/service";

type Summarizable = Pick<SubscriptionDTO, "card" | "currentAmountInCents">;

/** Ordem padrão: valor desc, descrição pt-BR, id (estável). */
export function sortSubscriptions<T extends SubscriptionDTO>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.currentAmountInCents - a.currentAmountInCents ||
      a.description.localeCompare(b.description, "pt-BR") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Total mensal e total por cartão (ADR-036): Σ do valor do mês corrente, inteiros em centavos. Puro. */
export function summarize(items: Summarizable[]): {
  totalInCents: number;
  byCard: SubscriptionCardTotal[];
} {
  const cards = new Map<string, SubscriptionCardTotal>();
  let totalInCents = 0;
  for (const s of items) {
    totalInCents += s.currentAmountInCents;
    const cur = cards.get(s.card.id);
    if (cur) cur.totalInCents += s.currentAmountInCents;
    else
      cards.set(s.card.id, {
        cardId: s.card.id,
        cardName: s.card.name,
        totalInCents: s.currentAmountInCents,
      });
  }
  const byCard = [...cards.values()].sort(
    (a, b) =>
      b.totalInCents - a.totalInCents ||
      a.cardName.localeCompare(b.cardName, "pt-BR") ||
      (a.cardId < b.cardId ? -1 : 1),
  );
  return { totalInCents, byCard };
}

/** GET /subscriptions (US-098): visível a todos da família; encerradas não somam (total 0, byCard vazio). */
export async function listSubscriptions(
  tx: Tx,
  ctx: RequestContext,
  q: ListSubscriptionsQuery,
): Promise<SubscriptionListResult> {
  const rows = await assinaturasRepo(tx, ctx.familyId).list(q.status, q.cardId, q.payerId);
  const items = sortSubscriptions(await toDTOs(tx, ctx, rows));
  if (q.status === "ended") return { items, totalInCents: 0, byCard: [] };
  return { items, ...summarize(items) };
}
