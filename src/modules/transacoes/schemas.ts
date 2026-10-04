import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, uuidSchema } from "@/lib/schemas";

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
