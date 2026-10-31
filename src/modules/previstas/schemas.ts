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
  paymentAccount: { id: string; name: string; archived: boolean; ownerId?: string } | null;
  paid: null | {
    // da Transaction gerada (fonte única do valor pago)
    transactionId: string;
    accountId: string;
    accountName: string;
    paidOn: string;
    amountInCents: number;
    differenceInCents: number; // efetivo − previsto (pode ser negativo)
    payer: MemberRef;
    /** D-GES-50: lançador e dono da conta da despesa gerada (quem controla o "Só meu" com o pagador). */
    authorId?: string;
    accountOwnerId?: string | null;
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

const cents = z.number().int();

/** SDD-029 §3.1: linha do resumo por conta no "A pagar" (US-060). */
export const ByAccountRowSchema = z
  .object({
    /** null = linha "Sem conta definida" (previstas e faturas sem conta). */
    account: z
      .object({
        id: z.uuid(),
        name: z.string(),
        archived: z.boolean(),
        excludeFromAvailable: z.boolean(), // reserva (US-057)
      })
      .nullable(),
    balanceInCents: cents.nullable(), // saldo de hoje; null só em "Sem conta definida"
    dueInCents: cents.nonnegative(), // Σ amountInCents dos itens do recorte nesta conta
    itemCount: z.number().int().nonnegative(),
    toReceiveInCents: cents.nonnegative(), // US-051; 0 até existir
    plannedTransfersInCents: cents, // US-100; líquido (entra − sai); 0 até existir
    projectedInCents: cents.nullable(), // balance − due + toReceive + plannedTransfers; null sem conta
    shortfallInCents: cents.nonnegative(), // max(0, −projected); 0 se projected null
  })
  .strict();

export const ByAccountSchema = z
  .object({
    rows: z.array(ByAccountRowSchema),
    columns: z.object({ toReceive: z.boolean(), plannedTransfers: z.boolean() }).strict(),
  })
  .strict();
export type ByAccountRow = z.infer<typeof ByAccountRowSchema>;
export type ByAccount = z.infer<typeof ByAccountSchema>;

export type PayableItemDTO = {
  type: "PLANNED" | "INVOICE";
  id: string; // PLANNED: id da previsão · INVOICE: `${cardId}:${ref}`
  title: string; // descrição | "Fatura {Cartão}"
  dueOn: string;
  amountInCents: number;
  isOverdue: boolean;
  responsible: MemberRef | null;
  isSharedExpense: boolean | null;
  invoiceStatus: "OPEN" | "CLOSED" | null; // selo da fatura (US-055); null em PLANNED
  isRecurring: boolean; // ocorrência de série (US-058)
  paymentAccountName: string | null; // "Pagar com" (US-059)
  /** SDD-029 §3.2: chave do resumo por conta. PLANNED: FK; INVOICE: conta pagadora do cartão (US-089) ou null. */
  paymentAccountId: string | null;
  /** D-GES-50: lançador e dono da conta "Pagar com" (controlam a prevista "Só meu" com o responsável). */
  authorId?: string;
  paymentAccountOwnerId?: string | null;
  href: string; // /previstas#id | /cartoes/{cardId}?ref={ref}
};

export type PayablesResponse = {
  items: PayableItemDTO[]; // atrasadas primeiro, depois por dueOn, depois título
  groups: { planned: PayableItemDTO[]; invoices: PayableItemDTO[] }; // US-055: previstas e faturas separadas
  period: { key: string; start: string; end: string };
  totals: { dueInCents: number; overdueInCents: number; overdueCount: number };
  byAccount: ByAccount; // US-060 (SDD-029): derivado dos MESMOS `items`
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
