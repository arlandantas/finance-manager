import type { MemberRef } from "@/lib/schemas";
import { invoiceDates, invoiceRefFor } from "@/modules/cartoes/cycle";
import type {
  CreateTransactionInput,
  ListTransactionsResponse,
  TransactionDTO,
} from "@/modules/transacoes/schemas";

/** Filtros da tela (mesmos nomes da API; compõem a chave de cache `["transactions", filtros]`). */
export type LedgerUiFilters = {
  period?: string;
  accountId?: string;
  cardId?: string;
  memberId?: string;
  categoryId?: string;
  type?: "EXPENSE" | "INCOME" | "TRANSFER" | "INVOICE_PAYMENT";
  shared?: boolean;
  includeDeleted?: boolean;
  q?: string;
};

export type PendingTransaction = TransactionDTO & { pending?: true };
export type LedgerPageData = Omit<ListTransactionsResponse, "items"> & {
  items: PendingTransaction[];
};
export type InfiniteLedger = { pages: LedgerPageData[]; pageParams: unknown[] };

/** O item recém-criado pertence ao resultado desse filtro? (SDD-001 §5.1, atualização otimista) */
export function admits(
  data: InfiniteLedger,
  filters: LedgerUiFilters,
  item: TransactionDTO,
): boolean {
  const period = data.pages[0]?.period;
  if (!period) return false;
  if (item.occurredOn < period.start || item.occurredOn > period.end) return false;
  if (filters.q && !item.description.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.accountId && filters.accountId !== item.account?.id) return false;
  if (filters.cardId && filters.cardId !== item.card?.id) return false;
  if (filters.categoryId && filters.categoryId !== item.category?.id) return false;
  if (
    filters.memberId &&
    filters.memberId !== item.payer?.id &&
    filters.memberId !== item.author.id
  )
    return false;
  if (filters.type === "TRANSFER") return false;
  if (filters.type && filters.type !== item.type) return false;
  if (
    filters.shared !== undefined &&
    !(item.type === "EXPENSE" && item.isSharedExpense === filters.shared)
  ) {
    return false;
  }
  return true;
}

/** Insere o item provisório na 1ª página (e ajusta totais). Devolve o mesmo objeto se não se aplica. */
export function insertPending(
  data: InfiniteLedger | undefined,
  item: PendingTransaction,
  filters: LedgerUiFilters,
): InfiniteLedger | undefined {
  if (!data || data.pages.length === 0 || !admits(data, filters, item)) return data;
  const [first, ...rest] = data.pages as [LedgerPageData, ...LedgerPageData[]];
  const index = first.items.findIndex((existing) => existing.occurredOn <= item.occurredOn);
  // Mais antigo que tudo o que está na 1ª página e há mais páginas: pertence a uma página seguinte.
  if (index === -1 && first.nextCursor) return data;
  const items = [...first.items];
  items.splice(index === -1 ? items.length : index, 0, item);
  const totals = first.totals
    ? {
        ...first.totals,
        count: first.totals.count + 1,
        incomeInCents:
          first.totals.incomeInCents + (item.type === "INCOME" ? item.amountInCents : 0),
        expenseInCents:
          first.totals.expenseInCents + (item.type === "EXPENSE" ? item.amountInCents : 0),
        balanceInCents:
          first.totals.balanceInCents +
          (item.type === "INCOME" ? item.amountInCents : -item.amountInCents),
      }
    : first.totals;
  return {
    ...data,
    pages: [
      {
        ...first,
        items,
        totals,
        hasAnyTransactions: first.hasAnyTransactions === null ? null : true,
      },
      ...rest,
    ],
  };
}

export type PendingLookups = {
  today: string;
  me: MemberRef;
  accounts: Array<{ id: string; name: string }>;
  cards?: Array<{ id: string; name: string; closingDay: number; dueDay: number }>;
  categories: Array<{
    id: string;
    name: string;
    icon: string;
    kind: "EXPENSE" | "INCOME";
    archived?: boolean;
  }>;
  members: MemberRef[];
  now: Date;
  key: string;
};

/** Monta o DTO provisório a partir do formulário; `null` se faltar dado de apoio no cache. */
export function buildPendingItem(
  input: CreateTransactionInput,
  l: PendingLookups,
): PendingTransaction | null {
  const account = l.accounts.find((a) => a.id === input.accountId) ?? null;
  const card =
    input.type === "EXPENSE" ? ((l.cards ?? []).find((c) => c.id === input.cardId) ?? null) : null;
  const category = l.categories.find((c) => c.id === input.categoryId);
  if ((!account && !card) || !category) return null;
  const occurredOn = input.occurredOn ?? l.today;
  const ref = card ? invoiceRefFor(occurredOn, card.closingDay) : null;
  const dates = card && ref ? invoiceDates(ref, card.closingDay, card.dueDay) : null;
  const payer = l.members.find((m) => m.id === input.payerMemberId) ?? l.me;
  const iso = l.now.toISOString();
  return {
    id: `pending-${l.key}`,
    type: input.type,
    direction: input.type === "EXPENSE" ? "DEBIT" : "CREDIT",
    amountInCents: input.amountInCents,
    occurredOn,
    description:
      (typeof input.description === "string" && input.description.trim()) || category.name,
    note: input.note ?? null,
    account: card ? null : account,
    card: card ? { id: card.id, name: card.name } : null,
    invoice: ref && dates ? { ref, closingDate: dates.closingDate, dueDate: dates.dueDate } : null,
    category: {
      id: category.id,
      name: category.name,
      icon: category.icon,
      kind: category.kind,
      archived: category.archived ?? false,
    },
    payer,
    author: l.me,
    updatedBy: null,
    isSharedExpense: input.type === "EXPENSE" ? (input.isSharedExpense ?? true) : false,
    transferGroupId: null,
    plannedExpenseId: null,
    isSettlement: false,
    counterpartAccount: null,
    version: 1,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
    deletionReason: null,
    pending: true,
  };
}
