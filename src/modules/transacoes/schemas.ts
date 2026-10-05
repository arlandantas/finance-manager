import { z } from "zod";
import { dateISOSchema, daysBetween } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema, versionSchema } from "@/lib/schemas";

/** Mensagem única de descrição inválida em despesa/receita/cartão (SDD-013 §1; previstas mantêm as suas). */
export const DESCRIPTION_MSG = "A descrição precisa ter entre 2 e 100 caracteres";

// Descrição opcional (Q-05): vazia/ausente => o servidor usa o nome da categoria.
const descriptionSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(2, DESCRIPTION_MSG).max(100, DESCRIPTION_MSG).optional(),
);

const common = {
  accountId: z.uuid({ error: "Escolha uma conta" }),
  categoryId: z.uuid({ error: "Escolha uma categoria" }),
  amountInCents: amountInCentsSchema,
  occurredOn: dateISOSchema.optional(), // padrão: hoje (servidor, fuso da família)
  payerMemberId: uuidSchema.optional(), // padrão: membro logado
  description: descriptionSchema,
  note: z.string().trim().max(500, "A observação deve ter no máximo 500 caracteres").optional(),
};

// SDD-008 §3.2: despesa em conta OU compra no cartão.
export const CreateExpenseSchema = z
  .object({
    type: z.literal("EXPENSE"),
    ...common,
    accountId: common.accountId.optional(),
    cardId: z.uuid({ error: "Escolha um cartão" }).optional(),
    isSharedExpense: z.boolean().default(false), // "Só meu" por padrão (US-030, D-GES-15)
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.accountId && !v.cardId) {
      c.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Escolha uma conta ou um cartão",
      });
    }
    if (v.accountId && v.cardId) {
      c.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Informe a conta ou o cartão, não os dois",
      });
    }
  });
export const CreateIncomeSchema = z.object({ type: z.literal("INCOME"), ...common }).strict();
export const CreateTransactionSchema = z.discriminatedUnion("type", [
  CreateExpenseSchema,
  CreateIncomeSchema,
]);
export type CreateTransactionInput = z.input<typeof CreateTransactionSchema>;
export type CreateTransactionParsed = z.output<typeof CreateTransactionSchema>;

// ── DTOs (SDD-001 §2) ──
export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "OPENING"
  | "INVOICE_PAYMENT";

export type TransactionDTO = {
  id: string;
  type: TransactionType; // = coluna Prisma `kind`
  direction: "CREDIT" | "DEBIT";
  amountInCents: number;
  occurredOn: string; // YYYY-MM-DD
  description: string;
  note: string | null;
  account: { id: string; name: string; archived?: boolean } | null; // null em compra no cartão; `archived` marca "(arquivada)"
  card: { id: string; name: string } | null; // compra no cartão e pagamento de fatura
  invoice: { ref: string; closingDate: string; dueDate: string } | null;
  category: {
    id: string;
    name: string;
    icon: string;
    kind: "EXPENSE" | "INCOME";
    archived: boolean;
  } | null;
  payer: MemberRef | null; // quem pagou/recebeu (D-PO-01)
  author: MemberRef; // autor do cadastro (RN-001.1)
  updatedBy: MemberRef | null;
  isSharedExpense: boolean; // "Dividir com a família"
  transferGroupId: string | null;
  plannedExpenseId: string | null; // previsão que originou esta despesa (baixa), SDD-009 §4.5
  isSettlement: boolean;
  counterpartAccount: { id: string; name: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletionReason: "DELETED" | "UNDONE" | null;
};

export type TransactionDetailDTO = TransactionDTO & { editedBy: MemberRef | null };

export type CreateTransactionResponse = {
  transaction: TransactionDTO;
  account?: { id: string; balanceInCents: number }; // só quando há conta
  card?: { id: string; usedInCents: number; availableInCents: number }; // só em compra no cartão
};

export type TransactionDefaults = {
  accountId: string | null;
  cardId: string | null;
  payerMemberId: string;
  today: string;
  // `available` = acerto ligado e 2+ membros ativos (esconde o interruptor "Dividir", US-028/030)
  split: { available: boolean; ruleShares: Array<{ memberId: string; bps: number }> | null };
};

// ── Extrato (SDD-005 §2) ──
const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const ListTransactionsQuerySchema = z
  .object({
    period: periodKeySchema.optional(), // padrão: período corrente
    from: dateISOSchema.optional(), // alternativa a period (ambos obrigatórios juntos)
    to: dateISOSchema.optional(),
    accountId: uuidSchema.optional(),
    memberId: uuidSchema.optional(), // pagou/recebeu OU autor
    categoryId: uuidSchema.optional(),
    cardId: uuidSchema.optional(),
    type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "INVOICE_PAYMENT"]).optional(),
    shared: boolParam.optional(), // true = comum; false = pessoal (só despesas)
    includeDeleted: boolParam.optional(),
    q: z.string().trim().min(2, "Digite ao menos 2 letras").max(50).optional(), // busca na descrição (US-024)
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .refine((v) => !(v.period && (v.from || v.to)), { message: "Use period ou from/to, não ambos" })
  .refine((v) => (v.from == null) === (v.to == null), { message: "Informe from e to juntos" })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && daysBetween(v.from, v.to) <= 366), {
    message: "Intervalo inválido",
  });
export type ListTransactionsQuery = z.output<typeof ListTransactionsQuerySchema>;

export type LedgerFilters = {
  familyId: string;
  start: string;
  end: string;
  accountId?: string;
  cardId?: string;
  memberId?: string;
  categoryId?: string;
  type?: "EXPENSE" | "INCOME" | "TRANSFER" | "INVOICE_PAYMENT";
  shared?: boolean;
  q?: string; // busca por descrição (ILIKE; sem acento-insensibilidade)
  includeDeleted: boolean;
};

export type LedgerTotalsDTO = {
  incomeInCents: number;
  expenseInCents: number;
  balanceInCents: number;
  count: number;
};

export type ListTransactionsResponse = {
  items: TransactionDTO[];
  nextCursor: string | null;
  period: { key: string; start: string; end: string } | null; // null quando from/to
  totals: LedgerTotalsDTO | null; // null se houve `cursor`
  hasAnyTransactions: boolean | null; // null se houve `cursor`; exclui OPENING e excluídos
};

// ── Edição, exclusão, restauração e histórico (SDD-001 §2, US-013) ──
export const UpdateTransactionSchema = z
  .object({
    version: versionSchema,
    confirmSettledPeriod: z.boolean().optional(),
    accountId: common.accountId.optional(),
    categoryId: common.categoryId.optional(),
    amountInCents: amountInCentsSchema.optional(),
    occurredOn: dateISOSchema.optional(),
    payerMemberId: uuidSchema.optional(),
    description: z.string().trim().min(2, DESCRIPTION_MSG).max(100, DESCRIPTION_MSG).optional(),
    note: z
      .string()
      .trim()
      .max(500, "A observação deve ter no máximo 500 caracteres")
      .nullable()
      .optional(),
    isSharedExpense: z.boolean().optional(), // só despesa; em receita => 400
  })
  .strict();
export type UpdateTransactionInput = z.input<typeof UpdateTransactionSchema>;
export type UpdateTransactionParsed = z.output<typeof UpdateTransactionSchema>;

export const TransactionStateSchema = z
  .object({ version: versionSchema, confirmSettledPeriod: z.boolean().optional() })
  .strict(); // delete / restore
export type TransactionStateInput = z.input<typeof TransactionStateSchema>;

export type RevisionDTO = {
  revision: number;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "UNDO";
  at: string;
  actor: MemberRef;
  changes: Array<{
    field: string;
    label: string;
    from: unknown;
    to: unknown;
    fromLabel?: string;
    toLabel?: string;
  }>;
};

export type UpdateTransactionResponse = {
  transaction: TransactionDetailDTO;
  account?: { id: string; balanceInCents: number }; // ausente em compra no cartão
  card?: { id: string; usedInCents: number; availableInCents: number };
};
