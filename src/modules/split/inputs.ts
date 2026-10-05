import { type DateISO, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import type { RuleInput } from "@/modules/split/rules";
import type { MemberInput } from "@/modules/split/settlement";

// Mapeamento das linhas do banco para as entradas dos motores puros (compartilhado pelo carregador do
// acerto, pela escrita do rateio e pela migração). Sem I/O.

/** Data de calendário (fuso da família) em que o membro entrou/saiu. */
export const memberJoinedOn = (m: { joinedAt: Date }): DateISO =>
  todayInFamilyTz({ now: () => m.joinedAt });

export type MemberRow = { id: string; joinedAt: Date; removedAt: Date | null };

/** Ordinal = posição por `joinedAt, id` (a ordem canônica do ADR-011 §5). */
export function memberInputsOf(rows: MemberRow[]): MemberInput[] {
  return rows.map((m, i) => ({
    id: m.id,
    ordinal: i,
    joinedOn: memberJoinedOn(m),
    removedOn: m.removedAt ? memberJoinedOn({ joinedAt: m.removedAt }) : null,
  }));
}

export type RuleRow = {
  id: string;
  kind: "EQUAL" | "PROPORTIONAL";
  effectiveFrom: Date;
  createdAt: Date;
  shares: Array<{ memberId: string; bps: number }>;
};

export function ruleInputsOf(rows: RuleRow[]): RuleInput[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    effectiveFrom: fromDbDate(r.effectiveFrom),
    createdAt: r.createdAt.toISOString(),
    shares: r.shares.map((s) => ({ memberId: s.memberId, bps: s.bps })),
  }));
}
