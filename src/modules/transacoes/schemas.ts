import { z } from "zod";
import { dateISOSchema, daysBetween } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema } from "@/lib/schemas";

// Descrição opcional (Q-05): vazia/ausente => o servidor usa o nome da categoria.
const descriptionSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .min(2, "A descrição deve ter no mínimo 2 caracteres")
    .max(100, "A descrição deve ter no máximo 100 caracteres")
    .optional(),
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

export const CreateExpenseSchema = z
  .object({ type: z.literal("EXPENSE"), ...common, isSharedExpense: z.boolean().default(true) })
  .strict();
export const CreateIncomeSchema = z.object({ type: z.literal("INCOME"), ...common }).strict();
export const CreateTransactionSchema = z.discriminatedUnion("type", [
  CreateExpenseSchema,
  CreateIncomeSchema,
]);
export type CreateTransactionInput = z.input<typeof CreateTransactionSchema>;
export type CreateTransactionParsed = z.output<typeof CreateTransactionSchema>;

export const CategoriesQuerySchema = z
  .object({ kind: z.enum(["EXPENSE", "INCOME"]).optional() })
  .strict();

// ── DTOs (SDD-001 §2) ──
export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER_OUT" | "TRANSFER_IN" | "OPENING";

export type TransactionDTO = {
  id: string;
  type: TransactionType; // = coluna Prisma `kind`
  direction: "CREDIT" | "DEBIT";
  amountInCents: number;
  occurredOn: string; // YYYY-MM-DD
  description: string;
  note: string | null;
  account: { id: string; name: string };
  category: { id: string; name: string; icon: string; kind: "EXPENSE" | "INCOME" } | null;
  payer: MemberRef | null; // quem pagou/recebeu (D-PO-01)
  author: MemberRef; // autor do cadastro (RN-001.1)
  updatedBy: MemberRef | null;
  isSharedExpense: boolean; // "Dividir com a família"
  transferGroupId: string | null;
  isSettlement: boolean;
  counterpartAccount: { id: string; name: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletionReason: "DELETED" | "UNDONE" | null;
};

export type TransactionDetailDTO = TransactionDTO & { editedBy: MemberRef | null };

export type CategoryDTO = { id: string; name: string; kind: "EXPENSE" | "INCOME"; icon: string };

export type CreateTransactionResponse = {
  transaction: TransactionDTO;
  account: { id: string; balanceInCents: number };
};

export type TransactionDefaults = {
  accountId: string | null;
  payerMemberId: string;
  today: string;
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
    type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
    shared: boolParam.optional(), // true = comum; false = pessoal (só despesas)
    includeDeleted: boolParam.optional(),
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
  memberId?: string;
  categoryId?: string;
  type?: "EXPENSE" | "INCOME" | "TRANSFER";
  shared?: boolean;
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
