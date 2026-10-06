import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema, versionSchema } from "@/lib/schemas";
import type { TransactionDTO } from "@/modules/transacoes/schemas";

// SDD-009 §2 (Zod 4).
const descriptionRequired = z
  .string({ error: "Informe a descrição" })
  .trim()
  .min(1, "Informe a descrição")
  .min(2, "A descrição deve ter no mínimo 2 caracteres")
  .max(100, "A descrição deve ter no máximo 100 caracteres");
const noteSchema = z.string().trim().max(500, "A observação deve ter no máximo 500 caracteres");

export const CreatePlannedExpenseSchema = z
  .object({
    description: descriptionRequired,
    amountInCents: amountInCentsSchema, // "Informe um valor maior que zero"
    dueOn: dateISOSchema.optional(), // padrão: hoje (servidor)
    categoryId: z.uuid({ error: "Escolha uma categoria" }), // categoria de DESPESA, ativa
    responsibleMemberId: uuidSchema.optional(), // padrão: membro logado (RN-001.2)
    isSharedExpense: z.boolean().default(false), // "Só meu" por padrão (US-030, D-GES-15)
    note: noteSchema.optional(),
    paymentAccountId: z.uuid({ error: "Escolha uma conta ativa" }).nullable().optional(), // US-059
  })
  .strict();
export type CreatePlannedExpenseInput = z.input<typeof CreatePlannedExpenseSchema>;
export type CreatePlannedExpenseParsed = z.output<typeof CreatePlannedExpenseSchema>;

export const UpdatePlannedExpenseSchema = z
  .object({
    version: versionSchema,
    description: descriptionRequired.optional(),
    amountInCents: amountInCentsSchema.optional(),
    dueOn: dateISOSchema.optional(),
    categoryId: z.uuid({ error: "Escolha uma categoria" }).optional(),
    responsibleMemberId: uuidSchema.optional(),
    isSharedExpense: z.boolean().optional(),
    note: noteSchema.nullable().optional(),
    paymentAccountId: z.uuid({ error: "Escolha uma conta ativa" }).nullable().optional(),
  })
  .strict();
export type UpdatePlannedExpenseInput = z.input<typeof UpdatePlannedExpenseSchema>;
export type UpdatePlannedExpenseParsed = z.output<typeof UpdatePlannedExpenseSchema>;

export const DeletePlannedExpenseSchema = z.object({ version: versionSchema }).strict();

export const PayPlannedExpenseSchema = z
  .object({
    version: versionSchema,
    accountId: z.uuid({ error: "Escolha a conta do pagamento" }),
    paidOn: dateISOSchema.optional(), // padrão: hoje; futura => 422
    amountInCents: amountInCentsSchema.optional(), // valor EFETIVO; padrão = previsto
    payerMemberId: uuidSchema.optional(), // padrão: responsável da previsão
    note: noteSchema.optional(),
  })
  .strict();
export type PayPlannedExpenseInput = z.input<typeof PayPlannedExpenseSchema>;
export type PayPlannedExpenseParsed = z.output<typeof PayPlannedExpenseSchema>;

export const UndoPlannedPaymentSchema = z.object({ version: versionSchema }).strict();

export const ListPlannedQuerySchema = z
  .object({
    period: periodKeySchema.optional(), // padrão: período corrente (por vencimento)
    status: z.enum(["PREVISTO", "PAGO"]).optional(),
  })
  .strict();
export type ListPlannedQuery = z.output<typeof ListPlannedQuerySchema>;
export const PayablesQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();

// ── DTOs ──
export type PlannedExpenseDTO = {
  id: string;
  description: string;
  amountInCents: number; // PREVISTO
  dueOn: string;
  status: "PREVISTO" | "PAGO";
  isOverdue: boolean;
  category: { id: string; name: string; icon: string; archived: boolean };
  responsible: MemberRef;
  author: MemberRef;
  updatedBy: MemberRef | null;
  isSharedExpense: boolean;
  note: string | null;
  // US-058/059 (SDD-019 §3.5)
  series: { id: string; dayOfMonth: number } | null;
  isException: boolean;
  occurrenceMonth: string | null; // YYYY-MM (ocorrência de série)
  paymentAccount: { id: string; name: string; archived: boolean } | null;
  paid: null | {
    // da Transaction gerada (fonte única do valor pago)
    transactionId: string;
    accountId: string;
    accountName: string;
    paidOn: string;
    amountInCents: number;
    differenceInCents: number; // efetivo − previsto (pode ser negativo)
    payer: MemberRef;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PlannedListResponse = {
  items: PlannedExpenseDTO[]; // por dueOn asc (atrasadas naturalmente primeiro), depois createdAt, id
  period: { key: string; start: string; end: string };
  totals: {
    plannedInCents: number;
    overdueInCents: number;
    overdueCount: number;
    paidInCents: number;
    count: number;
  };
};

export type PayableItemDTO = {
  type: "PLANNED" | "INVOICE";
  id: string; // PLANNED: id da previsão · INVOICE: `${cardId}:${ref}`
  title: string; // descrição | "Fatura {Cartão}"
  dueOn: string;
  amountInCents: number;
  isOverdue: boolean;
  responsible: MemberRef | null;
  isSharedExpense: boolean | null;
  isRecurring: boolean; // ocorrência de série (US-058)
  paymentAccountName: string | null; // "Pagar com" (US-059)
  href: string; // /previstas#id | /cartoes/{cardId}?ref={ref}
};

export type PayablesResponse = {
  items: PayableItemDTO[]; // atrasadas primeiro, depois por dueOn, depois título
  period: { key: string; start: string; end: string };
  totals: { dueInCents: number; overdueInCents: number; overdueCount: number };
};

export type HomePayablesDTO = {
  items: PayableItemDTO[]; // até 5
  overdue: { count: number; totalInCents: number };
  totalCount: number;
};

export type PayPlannedResponse = {
  plannedExpense: PlannedExpenseDTO;
  transaction: TransactionDTO;
  account: { id: string; balanceInCents: number };
};
