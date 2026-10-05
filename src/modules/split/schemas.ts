import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema } from "@/lib/schemas";
import type { SplitExplanationDTO } from "@/modules/split/explain";
import type { SettlementStatus } from "@/modules/split/settlement";

export type { SettlementStatus };

const PERCENT_MSG = "Informe um percentual entre 0% e 100%";
const bpsSchema = z
  .number({ error: PERCENT_MSG })
  .int(PERCENT_MSG)
  .min(0, PERCENT_MSG)
  .max(10000, PERCENT_MSG);

export const SplitRuleInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EQUAL"), effectiveFrom: dateISOSchema.optional() }).strict(),
  z
    .object({
      kind: z.literal("PROPORTIONAL"),
      shares: z.array(z.object({ memberId: uuidSchema, bps: bpsSchema }).strict()).min(1),
      effectiveFrom: dateISOSchema.optional(),
    })
    .strict()
    .refine((v) => v.shares.reduce((s, x) => s + x.bps, 0) === 10000, {
      path: ["shares"],
      message: "Os percentuais precisam somar 100%",
    })
    .refine((v) => new Set(v.shares.map((s) => s.memberId)).size === v.shares.length, {
      path: ["shares"],
      message: "Membro repetido",
    }),
]);
export type SplitRuleInput = z.input<typeof SplitRuleInputSchema>;
export type SplitRuleParsed = z.output<typeof SplitRuleInputSchema>;

export const SettlementPeriodQuerySchema = z
  .object({ period: periodKeySchema.optional() })
  .strict();
export type SettlementPeriodQuery = z.output<typeof SettlementPeriodQuerySchema>;

export const CreateSettlementSchema = z
  .object({
    period: periodKeySchema,
    fromMemberId: uuidSchema, // devedor
    toMemberId: uuidSchema, // credor
    amountInCents: amountInCentsSchema,
    fromAccountId: uuidSchema, // conta de origem
    toAccountId: uuidSchema, // conta de destino
    occurredOn: dateISOSchema.optional(), // padrão: hoje
  })
  .strict()
  .refine((v) => v.fromMemberId !== v.toMemberId, {
    path: ["toMemberId"],
    message: "Escolha membros diferentes",
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });
export type CreateSettlementInput = z.input<typeof CreateSettlementSchema>;
export type CreateSettlementParsed = z.output<typeof CreateSettlementSchema>;

// ── DTOs (SDD-002 §2) ──
export type RuleVersionDTO = {
  id: string;
  kind: "EQUAL" | "PROPORTIONAL";
  effectiveFrom: string;
  shares: Array<{ memberId: string; bps: number }>;
  createdAt: string;
  createdBy: MemberRef | null;
};
export type SplitRuleDTO = {
  current: RuleVersionDTO;
  upcoming: RuleVersionDTO[];
  members: MemberRef[];
  stale: boolean;
  canEdit: boolean;
};

export type SettlementMemberRow = {
  member: MemberRef;
  paidInCents: number;
  quotaInCents: number;
  differenceInCents: number;
  settledAdjustmentInCents: number;
  balanceInCents: number;
};
export type SettlementSuggestion = { from: MemberRef; to: MemberRef; amountInCents: number };
export type SettlementEntryDTO = {
  groupId: string;
  from: MemberRef;
  to: MemberRef;
  amountInCents: number;
  occurredOn: string;
  fromAccount: { id: string; name: string };
  toAccount: { id: string; name: string };
  author: MemberRef;
  createdAt: string;
  version: number;
  label: string; // "Acerto de contas - Outubro"
};
export type SettlementDTO = {
  period: { key: string; start: string; end: string; isCurrent: boolean };
  status: SettlementStatus;
  totalSharedInCents: number;
  rule: { kind: "EQUAL" | "PROPORTIONAL"; stale: boolean; canEdit: boolean };
  members: SettlementMemberRow[];
  splitExplanation: SplitExplanationDTO | null; // null com total comum = 0 (US-022)
  suggestions: SettlementSuggestion[];
  settlements: SettlementEntryDTO[];
};
export type SharedExpenseItemDTO = {
  id: string;
  description: string;
  amountInCents: number;
  occurredOn: string;
  payer: MemberRef;
  category: { id: string; name: string; icon: string };
};
export type SharedExpensesResponse = { items: SharedExpenseItemDTO[]; totalInCents: number };

export type { SplitExplanationDTO, SplitSegmentDTO } from "@/modules/split/explain";
export type SplitHistoryResponse = { items: RuleVersionDTO[] };
