import { z } from "zod";
import { type MemberRef, periodKeySchema } from "@/lib/schemas";
import type { AccountDTO } from "@/modules/contas/schemas";
import type { PayableItemDTO } from "@/modules/previstas/schemas";
import type { SettlementDTO } from "@/modules/split/schemas";
import type { TransactionDTO } from "@/modules/transacoes/schemas";

export const HomeQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();
/** Até hoje + 12 meses (validado no serviço). */
export const MonthSummaryQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();

export type PayableBreakdownDTO = {
  totalInCents: number; // plannedInCents + invoicesInCents
  plannedInCents: number; // previstas PREVISTO
  invoicesInCents: number; // faturas não pagas (linha "Faturas")
  overdueInCents: number;
  overdueCount: number; // vencimento < hoje
  items: PayableItemDTO[]; // até 5; atrasados primeiro
  totalCount: number; // itens existentes (para "Ver todas")
};

/** Resumo do Mês (US-025, SDD-010 §2): agregado único sobre as mesmas somas do Extrato. */
export type MonthSummaryDTO = {
  period: { key: string; start: string; end: string; isCurrent: boolean; isFuture: boolean };
  incomeInCents: number; // ledgerTotals.income (RN-015.1)
  expenseInCents: number; // competência; compra no cartão pela data; sem fatura/transferência/acerto
  resultInCents: number; // income - expense (pode ser negativo)
  toPay: PayableBreakdownDTO; // RN-015.2 (caixa)
  currentBalanceInCents: number; // soma dos saldos das contas (cartão não entra)
  projectedBalanceInCents: number; // current - toPay.total (RN-015.4)
  byMember: Array<{ member: MemberRef; paidInCents: number; sharePercent: number }>; // soma = 100
  isEmpty: boolean; // sem receita, despesa nem item a pagar
};

export type HomeDTO = {
  period: { key: string; start: string; end: string };
  monthSummary: MonthSummaryDTO;
  balances: { totalInCents: number; accounts: AccountDTO[] }; // card recolhível (US-026)
  // Indicador neutro (SDD-011 §3, US-029) ainda não construído: a Home segue com o card de acerto atual.
  settlement: Pick<SettlementDTO, "period" | "status" | "suggestions" | "rule"> | null; // null com o acerto desligado
  recent: TransactionDTO[];
  onboarding: {
    hasAccount: boolean;
    hasOtherMember: boolean;
    hasTransaction: boolean;
    showChecklist: boolean;
  };
  memberCount: number;
};
