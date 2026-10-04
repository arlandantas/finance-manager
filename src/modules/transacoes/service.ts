import { badRequest, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { formatInvoiceLabel, invoiceRefFor } from "@/modules/cartoes/cycle";
import { getOrCreateInvoice } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import {
  decodeCursor,
  encodeCursor,
  familyHasTransactions,
  ledgerPageIds,
  ledgerTotals,
} from "@/modules/transacoes/extrato";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  CreateTransactionParsed,
  CreateTransactionResponse,
  LedgerFilters,
  ListTransactionsQuery,
  ListTransactionsResponse,
  TransactionDefaults,
  TransactionDetailDTO,
  TransactionDTO,
} from "@/modules/transacoes/schemas";

type MemberRow = { id: string; user: { name: string | null; email: string; image: string | null } };

export const memberRefOf = (m: MemberRow): MemberRef => ({
  id: m.id,
  name: m.user.name ?? localPart(m.user.email),
  image: m.user.image,
});

type TxRow = {
  id: string;
  kind: TransactionDTO["type"];
  direction: "CREDIT" | "DEBIT";
  amountInCents: bigint;
  occurredOn: Date;
  description: string;
  note: string | null;
  payerMemberId: string | null;
  authorMemberId: string;
  updatedByMemberId: string | null;
  isSharedExpense: boolean;
  transferGroupId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletionReason: "DELETED" | "UNDONE" | null;
};

type CategoryRef = TransactionDTO["category"] & {};

export const categoryRefOf = (c: {
  id: string;
  name: string;
  icon: string;
  kind: "EXPENSE" | "INCOME";
  archivedAt: Date | null;
}): CategoryRef => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  kind: c.kind,
  archived: c.archivedAt !== null,
});

/** Monta o DTO de lançamento (SDD-001 §2) a partir da linha e dos mapas já carregados. */
export function toTransactionDTO(
  row: TxRow,
  ctx: {
    account: { id: string; name: string } | null;
    card?: { id: string; name: string } | null;
    invoice?: { ref: string; closingDate: string; dueDate: string } | null;
    plannedExpenseId?: string | null;
    category: CategoryRef | null;
    members: Map<string, MemberRef>;
  },
): TransactionDTO {
  const member = (id: string | null) => (id ? (ctx.members.get(id) ?? null) : null);
  const author = member(row.authorMemberId) ?? {
    id: row.authorMemberId,
    name: "Membro",
    image: null,
  };
  return {
    id: row.id,
    type: row.kind,
    direction: row.direction,
    amountInCents: toCents(row.amountInCents),
    occurredOn: fromDbDate(row.occurredOn),
    description: row.description,
    note: row.note,
    account: ctx.account,
    card: ctx.card ?? null,
    invoice: ctx.invoice ?? null,
    category: ctx.category,
    payer: member(row.payerMemberId),
    author,
    updatedBy: member(row.updatedByMemberId),
    isSharedExpense: row.isSharedExpense,
    transferGroupId: row.transferGroupId,
    plannedExpenseId: ctx.plannedExpenseId ?? null,
    isSettlement: false,
    counterpartAccount: null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deletionReason: row.deletionReason,
  };
}

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

/** SDD-001 §3: conta do último lançamento do membro; senão a de que é titular; senão a 1ª. */
export async function getDefaults(tx: Tx, ctx: RequestContext): Promise<TransactionDefaults> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const accountId =
    (await repo.lastAccountUsedBy(ctx.memberId)) ??
    (await repo.ownedAccountId(ctx.memberId)) ??
    (await repo.firstAccountId());
  const cardId = await repo.lastCardUsedBy(ctx.memberId);
  return { accountId, cardId, payerMemberId: ctx.memberId, today: todayInFamilyTz(ctx.clock) };
}

type ExpenseInput = Extract<CreateTransactionParsed, { type: "EXPENSE" }>;
type IncomeInput = Extract<CreateTransactionParsed, { type: "INCOME" }>;

/** US-005/US-006/US-016a (SDD-001 §4.1, SDD-008 §4.4): um lançamento = uma linha no ledger + revisão CREATE. */
export async function createTransaction(
  tx: Tx,
  ctx: RequestContext,
  input: CreateTransactionParsed,
): Promise<CreateTransactionResponse> {
  return input.type === "EXPENSE"
    ? createExpenseCore(tx, ctx, input, {})
    : createIncome(tx, ctx, input);
}

/**
 * Despesa em conta ou compra no cartão. Reutilizada pela baixa de previsão (SDD-009 §4.3), que
 * aceita categoria arquivada depois do cadastro.
 */
export async function createExpenseCore(
  tx: Tx,
  ctx: RequestContext,
  input: ExpenseInput,
  opts: { allowArchivedCategory?: boolean },
): Promise<CreateTransactionResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;

  // 2) referências da família
  const account = input.accountId ? await repo.findAccount(input.accountId) : null;
  if (input.accountId && !account) throw invalidRef("accountId", "Escolha uma conta");
  const card = input.cardId ? await repo.findCard(input.cardId) : null;
  if (input.cardId && !card) throw invalidRef("cardId", "Escolha um cartão");
  const category = opts.allowArchivedCategory
    ? await repo.findCategoryAny(input.categoryId)
    : await repo.findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  const payer = await repo.findMember(payerMemberId);
  if (!payer) throw invalidRef("payerMemberId", "Membro inválido");

  // 3) tipo x categoria
  if (category.kind !== "EXPENSE") {
    throw unprocessable(
      "CATEGORY_KIND_MISMATCH",
      "A categoria não combina com o tipo do lançamento",
      [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
    );
  }

  // 4) data não futura
  if (compareDate(occurredOn, today) > 0) {
    const message = card
      ? "A data da compra não pode ser futura"
      : "Para contas futuras, use Despesa prevista";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }

  // 5) fatura da compra (cria sob demanda, travada) e fatura paga recusa
  let invoice: { id: string; ref: string; closingDate: string; dueDate: string } | null = null;
  if (card) {
    const ref = invoiceRefFor(occurredOn, card.closingDay);
    invoice = await getOrCreateInvoice(tx, ctx.familyId, card, ref);
    if ((await activePayments(tx, ctx.familyId, [invoice.id])).has(invoice.id)) {
      throw unprocessable(
        "INVOICE_ALREADY_PAID",
        `A fatura de ${formatInvoiceLabel(ref)} já foi paga. Use uma data posterior ao fechamento.`,
        { ref },
      );
    }
  }

  const description = input.description ?? category.name;
  const row = await repo.insert({
    kind: "EXPENSE",
    direction: "DEBIT",
    accountId: account?.id ?? null,
    cardId: card?.id ?? null,
    invoiceId: invoice?.id ?? null,
    categoryId: category.id,
    amountInCents: input.amountInCents,
    occurredOn,
    description,
    note: input.note ?? null,
    payerMemberId,
    authorMemberId: ctx.memberId,
    isSharedExpense: input.isSharedExpense,
  });

  const dto = toTransactionDTO(row, {
    account,
    card: card ? { id: card.id, name: card.name } : null,
    invoice: invoice
      ? { ref: invoice.ref, closingDate: invoice.closingDate, dueDate: invoice.dueDate }
      : null,
    category: categoryRefOf(category),
    members: new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const)),
  });
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: row.id,
    revision: 1,
    action: "CREATE",
    actorMemberId: ctx.memberId,
    changes: [
      {
        field: "*",
        from: null,
        to: {
          kind: "EXPENSE",
          accountId: account?.id ?? null,
          cardId: card?.id ?? null,
          invoiceRef: invoice?.ref ?? null,
          categoryId: category.id,
          amountInCents: dto.amountInCents,
          occurredOn,
          description,
          payerMemberId,
          isSharedExpense: input.isSharedExpense,
        },
      },
    ],
  });
  if (card) {
    const used = (await cardUsage(tx, ctx.familyId, [card.id])).get(card.id) ?? 0;
    return {
      transaction: dto,
      card: {
        id: card.id,
        usedInCents: used,
        availableInCents: toCents(card.limitInCents) - used,
      },
    };
  }
  const accountId = (account as { id: string }).id;
  const balance = (await accountBalances(tx, ctx.familyId, [accountId])).get(accountId) ?? 0;
  return { transaction: dto, account: { id: accountId, balanceInCents: balance } };
}

async function createIncome(
  tx: Tx,
  ctx: RequestContext,
  input: IncomeInput,
): Promise<CreateTransactionResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;

  const account = await repo.findAccount(input.accountId);
  if (!account) throw invalidRef("accountId", "Escolha uma conta");
  const category = await repo.findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  const payer = await repo.findMember(payerMemberId);
  if (!payer) throw invalidRef("payerMemberId", "Membro inválido");
  if (category.kind !== "INCOME") {
    throw unprocessable(
      "CATEGORY_KIND_MISMATCH",
      "A categoria não combina com o tipo do lançamento",
      [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
    );
  }
  if (compareDate(occurredOn, today) > 0) {
    const message = "A data da receita não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }

  const description = input.description ?? category.name;
  const row = await repo.insert({
    kind: "INCOME",
    direction: "CREDIT",
    accountId: account.id,
    categoryId: category.id,
    amountInCents: input.amountInCents,
    occurredOn,
    description,
    note: input.note ?? null,
    payerMemberId,
    authorMemberId: ctx.memberId,
    isSharedExpense: false,
  });

  const dto = toTransactionDTO(row, {
    account,
    category: categoryRefOf(category),
    members: new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const)),
  });
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: row.id,
    revision: 1,
    action: "CREATE",
    actorMemberId: ctx.memberId,
    changes: [
      {
        field: "*",
        from: null,
        to: {
          kind: "INCOME",
          accountId: account.id,
          categoryId: category.id,
          amountInCents: dto.amountInCents,
          occurredOn,
          description,
          payerMemberId,
          isSharedExpense: false,
        },
      },
    ],
  });
  const balance = (await accountBalances(tx, ctx.familyId, [account.id])).get(account.id) ?? 0;
  return { transaction: dto, account: { id: account.id, balanceInCents: balance } };
}

type LoadedRow = Awaited<ReturnType<ReturnType<typeof transacoesRepo>["findById"]>> & {};

function dtoFromLoaded(
  r: NonNullable<LoadedRow>,
  members: Map<string, MemberRef>,
  counterpart: { id: string; name: string } | null,
): TransactionDTO {
  const dto = toTransactionDTO(r, {
    account: r.account,
    card: r.card,
    invoice: r.invoice
      ? {
          ref: r.invoice.referenceMonth,
          closingDate: fromDbDate(r.invoice.closingDate),
          dueDate: fromDbDate(r.invoice.dueDate),
        }
      : null,
    plannedExpenseId: r.paidPlanned?.id ?? null,
    category: r.category ? categoryRefOf(r.category) : null,
    members,
  });
  return {
    ...dto,
    isSettlement: r.group?.kind === "SETTLEMENT",
    counterpartAccount: counterpart,
  };
}

async function memberMap(repo: ReturnType<typeof transacoesRepo>) {
  return new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const));
}

/** Resolve a faixa de datas do filtro: `period`, `from/to` ou o período corrente (ADR-010). */
async function resolveRange(
  repo: ReturnType<typeof transacoesRepo>,
  ctx: RequestContext,
  q: ListTransactionsQuery,
) {
  if (q.from && q.to) return { start: q.from, end: q.to, period: null };
  const cutDay = await repo.cutDay();
  const p = q.period
    ? periodFromKey(q.period, cutDay)
    : periodOf(todayInFamilyTz(ctx.clock), cutDay);
  return { start: p.start, end: p.end, period: p };
}

/** GET /api/v1/transactions (SDD-005 §3.1): keyset + totais só na primeira página. */
export async function listTransactions(
  tx: Tx,
  ctx: RequestContext,
  q: ListTransactionsQuery,
): Promise<ListTransactionsResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) throw badRequest("INVALID_CURSOR", "Cursor inválido");

  const range = await resolveRange(repo, ctx, q);
  const filters: LedgerFilters = {
    familyId: ctx.familyId,
    start: range.start,
    end: range.end,
    includeDeleted: q.includeDeleted ?? false,
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.cardId ? { cardId: q.cardId } : {}),
    ...(q.memberId ? { memberId: q.memberId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.shared !== undefined ? { shared: q.shared } : {}),
  };

  const ids = await ledgerPageIds(tx, filters, cursor, q.limit);
  const hasMore = ids.length > q.limit;
  const pageIds = ids.slice(0, q.limit);
  const rows = await repo.findByIds(pageIds);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const members = await memberMap(repo);

  const groupIds = [
    ...new Set(rows.map((r) => r.transferGroupId).filter((g): g is string => g !== null)),
  ];
  const siblings = groupIds.length > 0 ? await repo.counterparts(groupIds) : [];
  const counterpartOf = (r: { id: string; transferGroupId: string | null }) => {
    const other = siblings.find((s) => s.transferGroupId === r.transferGroupId && s.id !== r.id);
    return other?.account ? { id: other.account.id, name: other.account.name } : null;
  };

  const items = pageIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => dtoFromLoaded(r, members, r.transferGroupId ? counterpartOf(r) : null));

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ d: last.occurredOn, c: last.createdAt, i: last.id }) : null;

  return {
    items,
    nextCursor,
    period: range.period,
    totals: cursor ? null : await ledgerTotals(tx, filters),
    hasAnyTransactions: cursor ? null : await familyHasTransactions(tx, ctx.familyId),
  };
}

/** GET /api/v1/transactions/:id (SDD-001 §3): detalhe com "Registrado por" e "Editado por". */
export async function getTransaction(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ transaction: TransactionDetailDTO }> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await repo.findById(id);
  if (!row) throw notFound("Lançamento não encontrado.");
  const members = await memberMap(repo);
  let counterpart: { id: string; name: string } | null = null;
  if (row.transferGroupId) {
    const siblings = await repo.counterparts([row.transferGroupId]);
    const other = siblings.find((s) => s.id !== row.id);
    counterpart = other?.account ? { id: other.account.id, name: other.account.name } : null;
  }
  const editorId = await repo.lastEditorId(row.id);
  return {
    transaction: {
      ...dtoFromLoaded(row, members, counterpart),
      editedBy: editorId ? (members.get(editorId) ?? null) : null,
    },
  };
}

/** DTOs de lançamentos já conhecidos por id, na ordem pedida (fatura, previstas, etc.). */
export async function loadTransactionDTOs(
  tx: Tx,
  ctx: RequestContext,
  ids: string[],
): Promise<TransactionDTO[]> {
  if (ids.length === 0) return [];
  const repo = transacoesRepo(tx, ctx.familyId);
  const rows = await repo.findByIds(ids);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const members = await memberMap(repo);
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => dtoFromLoaded(r, members, null));
}
