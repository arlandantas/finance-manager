import { firstChargeOn } from "@/modules/assinaturas/schedule";
import type { CreateSubscriptionInput } from "@/modules/assinaturas/schemas";
import type { MonthISO } from "@/modules/previstas/recurrence";
import type { DoorState } from "./door";

/** US-096d: "Todo mês" com cartão em "Já aconteceu" cadastra a assinatura (spec 12); só cliente, rota existente. */
export type SubscriptionBody = { service: "SUBSCRIPTION"; input: CreateSubscriptionInput };

export function buildSubscription(s: DoorState, payer: string): SubscriptionBody {
  return {
    service: "SUBSCRIPTION",
    input: {
      cardId: s.source.slice(5),
      description: s.description,
      amountInCents: s.cents,
      categoryId: s.categoryId,
      ...(payer ? { payerMemberId: payer } : {}),
      dayOfMonth: Number(s.day),
      startMonth: s.startMonth,
      end: s.endKind === "COUNT" ? { type: "COUNT", count: Number(s.endMonths) } : { type: "NONE" },
    },
  };
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Linha de efeito da assinatura (a data da 1ª cobrança vem de `firstChargeOn`, spec 12 regra 2). */
export function subscriptionEffect(cardName: string, day: number, firstOn: string): string {
  return `Lança sozinha todo dia ${day} no cartão ${cardName}. Primeira cobrança em ${brDate(firstOn)}`;
}

/** Linha de efeito pronta para a tela; nula enquanto dia/mês estão inválidos. */
export function subscriptionEffectLine(
  cardName: string,
  day: string,
  startMonth: string,
  today: string,
): string | null {
  const d = Number(day);
  if (!today || !startMonth || !Number.isInteger(d) || d < 1 || d > 31) return null;
  return subscriptionEffect(cardName, d, firstChargeOn(startMonth as MonthISO, d, today));
}
