import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { MAX_AMOUNT_IN_CENTS } from "@/lib/money";
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

// ── DTOs ──
export type AccountDTO = {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  owner: MemberRef;
  balanceInCents: number;
  version: number;
  createdAt: string;
};

export type AccountsResponse = { items: AccountDTO[]; totalBalanceInCents: number };
