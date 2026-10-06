import { z } from "zod";
import { type MemberRef, periodKeySchema } from "@/lib/schemas";
import type { AccountDTO } from "@/modules/contas/schemas";
import type { HomePayablesDTO, PayableItemDTO } from "@/modules/previstas/schemas";
import type { SettlementIndicatorDTO } from "@/modules/split/schemas";
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
  /** US-063: "Previstas" = faturas do período + a pagar em aberto + pagas. */
  planned: {
    invoicesInCents: number; // faturas com vencimento no período (pagas ou não) + atrasadas não pagas se corrente
    openInCents: number; // previstas PREVISTO do recorte (= toPay.plannedInCents)
    paidInCents: number; // previstas baixadas cuja Transaction cai no período
    totalInCents: number; // soma dos três
    openToPayInCents: number; // = toPay.totalInCents (reconcilia com a tela A pagar)
  };
  unplannedInCents: number; // EXPENSE do período sem cartão e sem baixa de prevista
  projectedExpenseInCents: number; // planned.totalInCents + unplannedInCents ("Despesas")
  currentBalanceInCents: number; // soma dos saldos das contas (cartão não entra)
  projectedBalanceInCents: number; // current - toPay.total (RN-015.4)
  byMember: Array<{ member: MemberRef; paidInCents: number; sharePercent: number }>; // soma = 100
  isEmpty: boolean; // sem receita, despesa nem item a pagar
};

export type HomeDTO = {
  period: { key: string; start: string; end: string };
  monthSummary: MonthSummaryDTO;
  balances: { totalInCents: number; reservesInCents: number; accounts: AccountDTO[] }; // card recolhível (US-026)
  settlementIndicator: SettlementIndicatorDTO | null; // null com o acerto desligado (US-029)
  dueSoon: HomePayablesDTO; // US-061: atrasados + próximos 7 dias (até 10)
  recent: TransactionDTO[]; // até 10
  onboarding: {
    hasAccount: boolean;
    hasOtherMember: boolean;
    hasTransaction: boolean;
    showChecklist: boolean;
  };
  memberCount: number;
};
