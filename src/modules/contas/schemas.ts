import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema, MAX_AMOUNT_IN_CENTS } from "@/lib/money";
import { type MemberRef, uuidSchema, versionSchema } from "@/lib/schemas";

// Tipos: CHECKING = Conta corrente · SAVINGS = Poupança · CASH = Dinheiro/carteira
export const INSTITUTION_SUGGESTIONS = [
  "Nubank",
  "Itaú",
  "Inter",
  "Bradesco",
  "Banco do Brasil",
  "Caixa",
  "Santander",
  "C6",
  "Outro",
] as const;

export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CASH"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CASH: "Dinheiro/carteira",
};

const accountName = z
  .string({ error: "Informe o nome da conta" })
  .trim()
  .min(2, "Informe o nome da conta")
  .max(60, "O nome deve ter no máximo 60 caracteres");

export const CreateAccountSchema = z
  .object({
    name: accountName,
    institution: z.string().trim().min(1).max(40).default("Outro"),
    type: z.enum(ACCOUNT_TYPES, { error: "Escolha o tipo da conta" }),
    ownerMemberId: uuidSchema.optional(), // padrão: membro logado
    openingBalanceInCents: z
      .number({ error: "O valor deve ser um número inteiro" })
      .int("O valor deve ser um número inteiro")
      .min(-MAX_AMOUNT_IN_CENTS)
      .max(MAX_AMOUNT_IN_CENTS)
      .default(0), // pode ser negativo
    openingDate: dateISOSchema.optional(), // padrão: hoje (servidor)
  })
  .strict();
export type CreateAccountInput = z.input<typeof CreateAccountSchema>;

export const RenameAccountSchema = z
  .object({
    name: accountName,
    version: versionSchema,
  })
  .strict();
export type RenameAccountInput = z.infer<typeof RenameAccountSchema>;

export const ArchiveAccountSchema = z.object({ version: versionSchema }).strict(); // archive / unarchive / delete
export const ListAccountsQuerySchema = z
  .object({ archived: z.enum(["false", "true", "all"]).default("false") })
  .strict();

// ── DTOs ──
export type AccountDTO = {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  owner: MemberRef;
  balanceInCents: number;
  usageCountByMe: number; // lançamentos do membro logado nos últimos 90 dias (desempate da sugestão, US-023)
  version: number;
  archived: boolean; // US-032
  archivedAt: string | null;
  neverUsed: boolean; // base de "Excluir" (a UI só mostra a ação a ADMIN)
  createdAt: string;
};

export type AccountsResponse = { items: AccountDTO[]; totalBalanceInCents: number };

// ── Transferência (SDD-004 §2) ──
export const CreateTransferSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountInCents: amountInCentsSchema,
    occurredOn: dateISOSchema.optional(), // padrão: hoje
    note: z.string().trim().max(500, "A observação deve ter no máximo 500 caracteres").optional(),
  })
  .strict()
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });
export type CreateTransferInput = z.input<typeof CreateTransferSchema>;

export const UndoTransferSchema = z.object({ version: versionSchema }).strict(); // version do TransferGroup
export type UndoTransferInput = z.infer<typeof UndoTransferSchema>;

export type TransferDTO = {
  groupId: string;
  kind: "TRANSFER" | "SETTLEMENT";
  occurredOn: string;
  amountInCents: number;
  from: { accountId: string; name: string; balanceAfterInCents: number };
  to: { accountId: string; name: string; balanceAfterInCents: number };
  author: MemberRef;
  note: string | null;
  version: number;
  createdAt: string;
  settlement: null | { period: string; fromMemberId: string; toMemberId: string };
  undoneAt: string | null;
};
