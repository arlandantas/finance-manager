// Regras puras das despesas previstas (SDD-009 §4). Sem Prisma e sem relógio: `today` é argumento.
import type { PayableItemDTO } from "@/modules/previstas/schemas";

export type DateISO = string;

/** "Atrasada" é derivada: PREVISTO com vencimento anterior a hoje (vencer hoje NÃO é atrasada). */
export function isPlannedOverdue(
  p: { status: "PREVISTO" | "PAGO"; dueOn: DateISO },
  today: DateISO,
): boolean {
  return p.status === "PREVISTO" && p.dueOn < today;
}

/** Diferença entre o valor efetivo e o previsto (pode ser negativa). */
export function plannedDifference(plannedInCents: number, effectiveInCents: number): number {
  return effectiveInCents - plannedInCents;
}

/** Atrasados primeiro; depois vencimento; depois título (SDD-009 §4.6). */
export function comparePayables(a: PayableItemDTO, b: PayableItemDTO): number {
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
  if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
  return a.title.localeCompare(b.title, "pt-BR");
}

/** "Elegível" no bloco da Home: atrasado ou vencendo em [hoje, hoje + 7 dias] (SDD-009 §4.6). */
export function isHomeEligible(dueOn: DateISO, today: DateISO, todayPlus7: DateISO): boolean {
  return dueOn < today || (dueOn >= today && dueOn <= todayPlus7);
}

/** Frase do desvio: "+R$ 32,50 sobre o previsto" / "-R$ 10,00 abaixo do previsto". */
export function differenceLabel(
  differenceInCents: number,
  format: (cents: number) => string,
): string {
  if (differenceInCents === 0) return "Igual ao previsto";
  const abs = format(Math.abs(differenceInCents));
  return differenceInCents > 0 ? `+${abs} sobre o previsto` : `-${abs} abaixo do previsto`;
}
