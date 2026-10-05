import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema, MAX_AMOUNT_IN_CENTS } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema, versionSchema } from "@/lib/schemas";
import type { TransactionDTO } from "@/modules/transacoes/schemas";

// SDD-008 §2 (Zod 4).
const dayOfMonth = (msg: string) => z.number({ error: msg }).int(msg).min(1, msg).max(28, msg);

const limitSchema = z
  .number({ error: "Informe um limite maior que zero" })
  .int("O limite deve ser um número inteiro de centavos")
  .positive("Informe um limite maior que zero")
  .max(MAX_AMOUNT_IN_CENTS, "Valor acima do limite permitido");

const CLOSING_MSG = "Escolha o dia de fechamento (1 a 28)";
const DUE_MSG = "Escolha o dia de vencimento (1 a 28)";
const cardName = z
  .string({ error: "Informe o nome do cartão" })
  .trim()
  .min(2, "Informe o nome do cartão")
  .max(60, "O nome deve ter no máximo 60 caracteres");

export const CreateCardSchema = z
  .object({
    name: cardName,
    institution: z.string().trim().min(1).max(40).default("Outro"),
    ownerMemberId: uuidSchema.optional(), // padrão: membro logado
    limitInCents: limitSchema,
    closingDay: dayOfMonth(CLOSING_MSG),
    dueDay: dayOfMonth(DUE_MSG),
  })
  .strict();
export type CreateCardInput = z.input<typeof CreateCardSchema>;
export type CreateCardParsed = z.output<typeof CreateCardSchema>;

export const UpdateCardSchema = z
  .object({
    version: versionSchema,
    name: cardName.optional(),
    institution: z.string().trim().min(1).max(40).optional(),
    ownerMemberId: uuidSchema.optional(),
    limitInCents: limitSchema.optional(),
    closingDay: dayOfMonth(CLOSING_MSG).optional(),
    dueDay: dayOfMonth(DUE_MSG).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nada para alterar" });
export type UpdateCardInput = z.input<typeof UpdateCardSchema>;
export type UpdateCardParsed = z.output<typeof UpdateCardSchema>;

export const PayInvoiceSchema = z
  .object({
    accountId: z.uuid({ error: "Escolha a conta de pagamento" }),
    paidOn: dateISOSchema.optional(), // padrão: hoje
    expectedTotalInCents: amountInCentsSchema, // total que o usuário viu
    note: z.string().trim().max(500, "A observação deve ter no máximo 500 caracteres").optional(),
  })
  .strict();
export type PayInvoiceInput = z.input<typeof PayInvoiceSchema>;
export type PayInvoiceParsed = z.output<typeof PayInvoiceSchema>;
export const UndoInvoicePaymentSchema = z.object({ version: versionSchema }).strict(); // version da perna de pagamento
export const InvoiceRefParamSchema = periodKeySchema; // :ref = "YYYY-MM" (mês de fechamento)

// ── DTOs ──
export type InvoiceStatus = "OPEN" | "CLOSED" | "PAID";
export type InvoiceSummaryDTO = {
  cardId: string;
  ref: string; // "2026-10"
  closingDate: string;
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  isOverdue: boolean; // CLOSED && hoje > dueDate
  totalInCents: number;
  purchasesCount: number;
  paidOn: string | null;
};
export type InvoiceDTO = InvoiceSummaryDTO & {
  purchases: TransactionDTO[]; // ativas, da mais recente à mais antiga (occurredOn, createdAt, id)
  byMember: Array<{ member: MemberRef; totalInCents: number; count: number }>;
  payment: null | {
    transactionId: string;
    accountId: string;
    accountName: string;
    paidOn: string;
    amountInCents: number;
    version: number;
    paidBy: MemberRef;
  };
  previousRef: string | null;
  nextRef: string | null; // navegação [mais antiga materializada .. fatura aberta]
  canPay: boolean; // CLOSED && total > 0
};
export type CardDTO = {
  id: string;
  name: string;
  institution: string;
  owner: MemberRef;
  limitInCents: number;
  usedInCents: number;
  availableInCents: number; // pode ser negativo
  closingDay: number;
  dueDay: number;
  cycleLocked: boolean;
  archived: boolean; // US-033
  archivedAt: string | null;
  neverUsed: boolean; // base de "Excluir" (sem nenhuma compra)
  version: number;
  createdAt: string;
  openInvoice: InvoiceSummaryDTO; // a fatura aberta hoje (virtual, total 0, se não materializada)
  payableInvoices: InvoiceSummaryDTO[]; // CLOSED (inclui vencidas) com total > 0, mais antigas primeiro
};
export type CardsResponse = {
  items: CardDTO[];
  totalLimitInCents: number;
  totalUsedInCents: number;
};
export type PayInvoiceResponse = {
  invoice: InvoiceDTO;
  payment: TransactionDTO;
  account: { id: string; balanceInCents: number };
  card: { id: string; usedInCents: number; availableInCents: number };
};

export const ArchiveCardSchema = z.object({ version: versionSchema }).strict(); // archive / unarchive / delete
export const ListCardsQuerySchema = z
  .object({ archived: z.enum(["false", "true", "all"]).default("false") })
  .strict();
