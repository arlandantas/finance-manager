import { centsToMicro } from "@/modules/ia/pricing";

// SDD-021 §4.3: decisão pura do teto (a parte atômica, com SQL, fica em repo.ts).

export type BudgetDecision = "ok" | "exceeded" | "estimate_exceeds";

/**
 * - gasto ≥ teto ⇒ `exceeded` (nem tenta);
 * - gasto + reservado + estimativa > teto ⇒ `estimate_exceeds`;
 * - senão `ok`.
 */
export function decideBudget(i: {
  spentMicro: bigint;
  reservedMicro: bigint;
  estimateMicro: bigint;
  capCents: number;
}): BudgetDecision {
  const cap = centsToMicro(i.capCents);
  if (i.spentMicro >= cap) return "exceeded";
  if (i.spentMicro + i.reservedMicro + i.estimateMicro > cap) return "estimate_exceeds";
  return "ok";
}

/** Reserva órfã: vence em 10 min e passa a contar como gasta (conservador). */
export const RESERVATION_TTL_MS = 10 * 60 * 1000;
