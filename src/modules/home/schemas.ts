import { z } from "zod";
import { type MemberRef, periodKeySchema } from "@/lib/schemas";
import type { AccountDTO } from "@/modules/contas/schemas";
import type { HomePayablesDTO } from "@/modules/previstas/schemas";
import type { SettlementDTO } from "@/modules/split/schemas";
import type { TransactionDTO } from "@/modules/transacoes/schemas";

export const HomeQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();

export type HomeDTO = {
  period: { key: string; start: string; end: string };
  familyBalanceInCents: number;
  accounts: AccountDTO[];
  settlement: Pick<SettlementDTO, "period" | "status" | "suggestions" | "rule">;
  monthSummary: {
    incomeInCents: number;
    expenseInCents: number;
    byMember: Array<{ member: MemberRef; paidInCents: number; sharePercent: number }>;
  };
  payables: HomePayablesDTO;
  recent: TransactionDTO[];
  onboarding: {
    hasAccount: boolean;
    hasOtherMember: boolean;
    hasTransaction: boolean;
    showChecklist: boolean;
  };
  memberCount: number;
};
