import { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/dates";

/**
 * Predicado ÚNICO de período e visibilidade do ledger (SDD-010 §4.1, ADR-017 §3, ADR-018).
 * Toda consulta por período (Extrato lista/totais, Resumo, `byMember`, carga do acerto, pendências,
 * "Só meu") passa por aqui; `check:imports` proíbe `occurredOn`/`competenceOn` com
 * BETWEEN/gte/lte fora deste arquivo. R3 (US-040b): o período é pela COMPETÊNCIA, derivada no banco
 * (ADR-020): lançamento comum = `occurredOn`; parcela = fechamento da fatura em que cai.
 */
export function periodPredicate(alias: string, start: string, end: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("alias inválido");
  return Prisma.sql`${Prisma.raw(`${alias}."competenceOn"`)} BETWEEN ${start}::date AND ${end}::date`;
}

/** Gancho do ADR-018 (contas privadas): hoje não restringe nada. */
export function visibilityPredicate(_alias: string, _memberId: string): Prisma.Sql {
  return Prisma.sql`TRUE`;
}

/** Mesmo predicado de período para consultas pelo cliente Prisma (`findMany`/`groupBy`). */
export function periodFilter(
  start: string,
  end: string,
): { competenceOn: { gte: Date; lte: Date } } {
  return { competenceOn: { gte: toDbDate(start), lte: toDbDate(end) } };
}

/** "Já aconteceu" por data de calendário (ADR-020 §4): exclui parcelas com data futura. Não é período. */
export function notFutureFilter(today: string): { occurredOn: { lte: Date } } {
  return { occurredOn: { lte: toDbDate(today) } };
}
