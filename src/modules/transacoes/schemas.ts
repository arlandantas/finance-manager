import { z } from "zod";
import { addDays, dateISOSchema } from "@/lib/dates";
import { amountInCentsSchema } from "@/lib/money";
import { type MemberRef, periodKeySchema, uuidSchema, versionSchema } from "@/lib/schemas";
import type { InvoiceStatus } from "@/modules/cartoes/cycle";
import { addMonthsClamped, MAX_INSTALLMENTS } from "@/modules/cartoes/installments";
import type { AccountColor } from "@/modules/contas/colors";
import { TagNamesSchema, type TagRef } from "@/modules/tags/schemas";

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
  tags: TagNamesSchema.optional(), // US-045: nomes digitados; o servidor reaproveita/cria (ausente = sem tags)
};

const INSTALLMENTS_MSG = "Escolha de 1 a 24 parcelas";
const installmentsSchema = z
  .number({ error: INSTALLMENTS_MSG })
  .int(INSTALLMENTS_MSG)
  .min(1, INSTALLMENTS_MSG)
  .max(MAX_INSTALLMENTS, INSTALLMENTS_MSG)
  .default(1);

const PAID_INT_MSG = "Informe um número inteiro de parcelas pagas";
export const PAID_BEFORE_APP_MSG = "Informe menos parcelas pagas do que o total do parcelamento";
export const PAID_ONLY_INSTALLMENT_MSG = "Parcelas já pagas só valem para compra parcelada";
/** US-065 (SDD-020 §2): parcelas pagas antes do app. */
export const paidBeforeAppSchema = z
  .number({ error: PAID_INT_MSG })
  .int(PAID_INT_MSG)
  .min(0, PAID_INT_MSG)
  .max(MAX_INSTALLMENTS - 1, PAID_BEFORE_APP_MSG)
  .default(0);

// SDD-008 §3.2: despesa em conta OU compra no cartão. SDD-014 §2: `installments` (só no cartão).
export const CreateExpenseSchema = z
  .object({
    type: z.literal("EXPENSE"),
    ...common,
    accountId: common.accountId.optional(),
    cardId: z.uuid({ error: "Escolha um cartão" }).optional(),
    isSharedExpense: z.boolean().default(false), // "Só meu" por padrão (US-030, D-GES-15)
    installments: installmentsSchema,
    paidBeforeApp: paidBeforeAppSchema,
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
    if (v.installments > 1 && !v.cardId) {
      c.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Parcelas só valem para compra no cartão",
      });
    }
    if (v.paidBeforeApp > 0 && v.installments < 2) {
      c.addIssue({
        code: "custom",
        path: ["paidBeforeApp"],
        message: PAID_ONLY_INSTALLMENT_MSG,
      });
    } else if (v.installments >= 2 && v.paidBeforeApp >= v.installments) {
      c.addIssue({ code: "custom", path: ["paidBeforeApp"], message: PAID_BEFORE_APP_MSG });
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

export type InstallmentDTO = { planId: string; no: number; count: number };

export type TransactionDTO = {
  id: string;
  type: TransactionType; // = coluna Prisma `kind`
  direction: "CREDIT" | "DEBIT";
  amountInCents: number;
  occurredOn: string; // YYYY-MM-DD
  competenceOn: string; // YYYY-MM-DD: em que mês conta (ADR-020); = occurredOn salvo em parcela
  installment: InstallmentDTO | null; // US-040: parcela de compra parcelada
  description: string;
  note: string | null;
  tags: TagRef[]; // US-045: chips ordenados por nome ([] fora de despesa/receita)
  account: { id: string; name: string; color: AccountColor; archived?: boolean } | null; // null em compra no cartão; `archived` marca "(arquivada)"
  card: { id: string; name: string; color: AccountColor; archived?: boolean } | null; // compra no cartão e pagamento de fatura
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
  /** D-GES-50: dono da conta (ou do cartão) do lançamento; quem controla um "Só meu" junto com o pagador e o autor. */
  accountOwnerId?: string | null;
  /** US-076a: selo "via assistente" (rótulo da conexão; "assistente removido" se expurgada). */
  viaAssistant: { label: string } | null;
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

export type InstallmentParcelDTO = {
  transactionId: string;
  no: number;
  amountInCents: number;
  occurredOn: string;
  invoice: {
    ref: string;
    closingDate: string;
    dueDate: string;
    status: InvoiceStatus;
    isFuture: boolean;
  };
  state: "ACTIVE" | "REMOVED";
  locked: boolean;
  lockedReason: "INVOICE_CLOSED" | "INVOICE_PAID" | null;
  version: number;
};

export type InstallmentPlanDTO = {
  id: string;
  description: string;
  note: string | null;
  card: { id: string; name: string; color: AccountColor };
  category: { id: string; name: string; icon: string };
  payer: MemberRef;
  author: MemberRef;
  count: number;
  purchaseOn: string; // data nominal da 1ª parcela LANÇADA (= data da compra quando paidBeforeApp = null)
  /** US-065: parcelas 1..P anteriores ao app. `amountInCents` é INFORMATIVO (nunca somado em total). */
  paidBeforeApp: { count: number; fromNo: 1; toNo: number; amountInCents: number } | null;
  purchaseOnKnown: boolean; // false quando há parcelas anteriores ao app
  totalInCents: number; // total ORIGINAL da compra
  currentTotalInCents: number; // Σ parcelas ATIVAS
  activeCount: number;
  installments: InstallmentParcelDTO[];
  isShared: boolean;
  canDelete: boolean;
  deleteBlockedReason: "INVOICE_CLOSED" | "INVOICE_PAID" | "CARD_ARCHIVED" | null;
  version: number;
  deleted: boolean;
  deletedAt: string | null;
};

export const DeleteInstallmentPlanSchema = z
  .object({ version: versionSchema, confirmSettledPeriod: z.boolean().optional() })
  .strict();
export const RestoreInstallmentPlanSchema = z
  .object({ version: versionSchema, confirmSettledPeriod: z.boolean().optional() })
  .strict();
export type DeleteInstallmentPlanInput = z.input<typeof DeleteInstallmentPlanSchema>;
export type RestoreInstallmentPlanInput = z.input<typeof RestoreInstallmentPlanSchema>;

export type InstallmentPlanResponse = {
  plan: InstallmentPlanDTO;
  card: { id: string; usedInCents: number; availableInCents: number };
};

export type CreateTransactionResponse = {
  transaction: TransactionDTO;
  plan?: InstallmentPlanDTO; // só quando installments > 1
  account?: { id: string; balanceInCents: number }; // só quando há conta
  card?: { id: string; usedInCents: number; availableInCents: number }; // só em compra no cartão
};

export type TransactionDefaults = {
  accountId: string | null;
  cardId: string | null;
  payerMemberId: string;
  today: string;
  // `available` = acerto ligado e 2+ membros ativos (esconde o interruptor "Dividir", US-028/030)
  split: {
    available: boolean;
    ruleShares: Array<{ memberId: string; bps: number }> | null;
    installmentsAvailable: boolean; // US-042 liga (compra parcelada dividida)
  };
};

// ── Extrato (SDD-005 §2) ──
/** Último dia de uma janela de 24 meses a partir de `from` (inclusive). */
const lastDayOfWindow = (from: string) => addDays(addMonthsClamped(from, 24), -1);
const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");
/** Filtro plural (OU dentro): `?tagIds=a&tagIds=b` ou um só valor; no máximo 20 (SDD-016 §1). */
export const idListParam = z
  .union([uuidSchema, z.array(uuidSchema).max(20, "Escolha no máximo 20 valores no filtro")])
  .transform((v) => (Array.isArray(v) ? v : [v]));
export const UNTAGGED_WITH_TAGS_MSG = 'Use tags ou "sem tag", não os dois';

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
    origin: z.enum(["APP", "ASSISTANT"]).optional(), // US-076a: "Pelo app" / "Via assistente"
    categoryIds: idListParam.optional(), // SDD-016 §1: plurais (OU dentro, E entre filtros)
    payerIds: idListParam.optional(), // quem pagou/recebeu (difere de `memberId`: pagador OU autor)
    sourceIds: idListParam.optional(), // ids de conta OU cartão
    tagIds: idListParam.optional(), // US-047: qualquer uma das tags
    untagged: boolParam.optional(), // drill-down "Sem tag"
    includeDeleted: boolParam.optional(),
    q: z.string().trim().min(2, "Digite ao menos 2 letras").max(50).optional(), // busca na descrição (US-024)
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()
  .refine((v) => !(v.period && (v.from || v.to)), { message: "Use period ou from/to, não ambos" })
  .refine((v) => (v.from == null) === (v.to == null), { message: "Informe from e to juntos" })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Intervalo inválido" })
  .refine((v) => !(v.untagged === true && v.tagIds && v.tagIds.length > 0), {
    message: UNTAGGED_WITH_TAGS_MSG,
    path: ["untagged"],
  })
  // US-040b (SDD-016 §3.4, D-PO-44): as parcelas ocupam até 24 competências
  .refine((v) => !v.from || !v.to || v.from > v.to || v.to <= lastDayOfWindow(v.from), {
    message: "Escolha um intervalo de até 24 meses",
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
  categoryIds?: string[]; // SDD-016 §1: plurais (OU dentro, E entre filtros)
  payerIds?: string[]; // quem pagou/recebeu
  sourceIds?: string[]; // conta ou cartão
  tagIds?: string[]; // US-047: qualquer uma (EXISTS, sem junção)
  untagged?: boolean; // sem nenhuma tag (só despesa/receita têm tags)
  type?: "EXPENSE" | "INCOME" | "TRANSFER" | "INVOICE_PAYMENT";
  shared?: boolean;
  origin?: "APP" | "ASSISTANT"; // US-076a: predicado a mais, como `shared` (totais continuam reconciliados)
  q?: string; // busca por descrição (ILIKE; sem acento-insensibilidade)
  includeDeleted: boolean;
  occurredUntil?: string; // interno (Home "recentes", ADR-020 §4): nada com data de calendário futura
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
    tags: TagNamesSchema.optional(), // US-045: SUBSTITUI o conjunto ([] limpa; ausente não toca)
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
    source?: string; // US-072: "CATEGORY_SUGGESTION" | "CATEGORY_SUGGESTION_UNDO"
  }>;
};

export type UpdateTransactionResponse = {
  transaction: TransactionDetailDTO;
  account?: { id: string; balanceInCents: number }; // ausente em compra no cartão
  card?: { id: string; usedInCents: number; availableInCents: number };
};
