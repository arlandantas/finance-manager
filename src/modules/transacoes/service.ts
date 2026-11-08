import { badRequest, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { formatInvoiceLabel, invoiceRefFor } from "@/modules/cartoes/cycle";
import { INSTALLMENT_SPLIT_RELEASED } from "@/modules/cartoes/installments";
import { getOrCreateInvoice } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import type { AccountColor } from "@/modules/contas/colors";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { lockAccountsForPosting } from "@/modules/contas/lock";
import { type MemberRefSource, toMemberRef } from "@/modules/familia/display-name";
import { currentRuleShares } from "@/modules/split/current-rule";
import { assertCanShare, isSettlementEnabled } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { splitOf } from "@/modules/split/split-input";
import { insertSplitRows, resolveSplit } from "@/modules/split/write";
import type { TagRef } from "@/modules/tags/schemas";
import { attachTagsOnCreate, sortTagRefs } from "@/modules/tags/service";
import {
  decodeCursor,
  encodeCursor,
  familyHasTransactions,
  ledgerPageIds,
  ledgerTotals,
} from "@/modules/transacoes/extrato";
import { originFlags } from "@/modules/transacoes/origin";
import { assertPersonalForSelf, memberRefsWithReturn } from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  CreateTransactionParsed,
  CreateTransactionResponse,
  LedgerFilters,
  ListTransactionsQuery,
  ListTransactionsResponse,
  SplitDTO,
  TransactionDefaults,
  TransactionDetailDTO,
  TransactionDTO,
} from "@/modules/transacoes/schemas";

type MemberRow = MemberRefSource;

export const memberRefOf = (m: MemberRow): MemberRef => toMemberRef(m);

type TxRow = {
  id: string;
  kind: TransactionDTO["type"];
  direction: "CREDIT" | "DEBIT";
  amountInCents: bigint;
  occurredOn: Date;
  competenceOn: Date;
  installmentPlanId: string | null;
  installmentNo: number | null;
  installmentCount: number | null;
  description: string;
  note: string | null;
  payerMemberId: string | null;
  authorMemberId: string;
  updatedByMemberId: string | null;
  isSharedExpense: boolean;
  /** US-043: modo e linhas do rateio (ausentes em linhas montadas sem `splits`). */
  splitMode?: "NONE" | "RULE" | "CUSTOM";
  splitRuleVersionId?: string | null;
  splits?: Array<{ memberId: string; bps: number; amountInCents: bigint }>;
  transferGroupId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletionReason: "DELETED" | "UNDONE" | null;
  origin?: "APP" | "ASSISTANT" | "SUBSCRIPTION" | "INVOICE_IMPORT";
  assistantGrantId?: string | null;
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
    account: { id: string; name: string; color: AccountColor; archived?: boolean } | null;
    card?: { id: string; name: string; color: AccountColor; archived?: boolean } | null;
    invoice?: { ref: string; closingDate: string; dueDate: string } | null;
    plannedExpenseId?: string | null;
    accountOwnerId?: string | null;
    category: CategoryRef | null;
    members: Map<string, MemberRef>;
    /** US-045: chips do lançamento (despesa/receita); ausente = sem tags. */
    tags?: TagRef[];
    /** Rótulos das conexões (grantId ⇒ "Meu Claude") para o selo "via assistente". */
    assistantLabels?: Map<string, string>;
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
    competenceOn: fromDbDate(row.competenceOn),
    installment:
      row.installmentPlanId && row.installmentNo && row.installmentCount
        ? { planId: row.installmentPlanId, no: row.installmentNo, count: row.installmentCount }
        : null,
    description: row.description,
    note: row.note,
    tags: ctx.tags ?? [],
    account: ctx.account,
    card: ctx.card ?? null,
    invoice: ctx.invoice ?? null,
    category: ctx.category,
    payer: member(row.payerMemberId),
    author,
    updatedBy: member(row.updatedByMemberId),
    isSharedExpense: row.isSharedExpense,
    split: splitDtoOf(row, ctx.members),
    ...(ctx.accountOwnerId !== undefined ? { accountOwnerId: ctx.accountOwnerId } : {}),
    ...originFlags(row, ctx.assistantLabels),
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

/** US-043: `TransactionDTO.split`; só despesa dividida e STORED tem modo gravado. */
function splitDtoOf(row: TxRow, members: Map<string, MemberRef>): SplitDTO | null {
  if (!row.splitMode || row.splitMode === "NONE" || row.kind !== "EXPENSE") return null;
  return {
    mode: row.splitMode,
    ruleVersionId: row.splitRuleVersionId ?? null,
    shares: (row.splits ?? []).map((s) => ({
      member: members.get(s.memberId) ?? { id: s.memberId, name: "Membro", image: null },
      bps: s.bps,
      amountInCents: toCents(s.amountInCents),
    })),
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
  const cardId = await repo.lastCardUsedBy(ctx.memberId, todayInFamilyTz(ctx.clock));
  const members = await repo.countMembers();
  const enabled = await isSettlementEnabled(tx, ctx.familyId);
  // "De outro jeito" (CUSTOM) só em famílias que gravam o rateio por lançamento (STORED)
  const stored =
    (await tx.family.findFirst({ where: { id: ctx.familyId }, select: { splitEngine: true } }))
      ?.splitEngine === "STORED";
  return {
    accountId,
    cardId,
    payerMemberId: ctx.memberId,
    today: todayInFamilyTz(ctx.clock),
    split: {
      available: enabled && members >= 2,
      ruleShares: enabled && members >= 2 ? await currentRuleShares(tx, ctx) : null,
      modes: stored ? ["NONE", "RULE", "CUSTOM"] : ["NONE", "RULE"],
      installmentsAvailable: INSTALLMENT_SPLIT_RELEASED,
    },
  };
}

type ExpenseInput = Extract<CreateTransactionParsed, { type: "EXPENSE" }>;
type IncomeInput = Extract<CreateTransactionParsed, { type: "INCOME" }>;

/** US-005/US-006/US-016a (SDD-001 §4.1, SDD-008 §4.4): um lançamento = uma linha no ledger + revisão CREATE. */
export async function createTransaction(
  tx: Tx,
  ctx: RequestContext,
  input: CreateTransactionParsed,
): Promise<CreateTransactionResponse> {
  if (input.type === "EXPENSE" && splitOf(input).mode !== "NONE") await assertCanShare(tx, ctx);
  return input.type === "EXPENSE"
    ? createExpenseCore(tx, ctx, input, {})
    : createIncomeCore(tx, ctx, input, {});
}

/**
 * Despesa em conta ou compra no cartão. Reutilizada pela baixa de previsão (SDD-009 §4.3), que
 * aceita categoria arquivada depois do cadastro.
 */
export async function createExpenseCore(
  tx: Tx,
  ctx: RequestContext,
  input: ExpenseInput,
  opts: {
    allowArchivedCategory?: boolean;
    /** D-GES-50: baixa de prevista "Só meu" (já existente): quem controla não vira o pagador (checagem na baixa). */
    personalFromPlanned?: boolean;
    /** US-076a: lançamento direto pelo assistente (só a ferramenta `lancar_despesa` informa). */
    assistant?: { grantId: string; idemKey: string | null; label: string };
    /** US-096 (ADR-036): cobrança automática de assinatura; autor = o da assinatura, sem checar ator × pagador. */
    subscription?: { subscriptionId: string; authorMemberId: string };
  },
): Promise<CreateTransactionResponse> {
  // ADR-021 §2: a trava de família é a PRIMEIRA trava; o motor lido depois dela decide se grava rateio
  const engine = await lockFamilySplit(tx, ctx.familyId);
  const split = splitOf(input); // US-043: `split` ou legado `isSharedExpense` (true == RULE)
  const shared = split.mode !== "NONE";
  if (shared && engine !== "STORED" && split.mode === "CUSTOM") {
    throw unprocessable(
      "CUSTOM_SPLIT_UNAVAILABLE",
      "Esta família ainda não aceita divisão personalizada",
    );
  }
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;

  // 2) referências da família
  const account = input.accountId ? await repo.findAccount(input.accountId) : null;
  if (input.accountId && !account) throw invalidRef("accountId", "Escolha uma conta");
  if (account) await lockAccountsForPosting(tx, ctx.familyId, [account.id]);
  const card = input.cardId ? await repo.findCardForPosting(input.cardId) : null;
  if (input.cardId && !card) throw invalidRef("cardId", "Escolha um cartão");
  const category = opts.allowArchivedCategory
    ? await repo.findCategoryAny(input.categoryId)
    : await repo.findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  const payer = await repo.findMember(payerMemberId);
  if (!payer) throw invalidRef("payerMemberId", "Membro inválido");
  if (!opts.personalFromPlanned && !opts.subscription) {
    await assertPersonalForSelf(
      tx,
      ctx,
      { isSharedExpense: shared, payerMemberId },
      { assistant: opts.assistant },
    ); // SEC-026c; US-093b: exceção do Admin, nunca pelo MCP
  }

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
  // EN-002a: famílias STORED gravam o rateio por lançamento ("Pela regra" na data da despesa)
  const rule =
    engine === "STORED" ? await resolveSplit(tx, ctx.familyId, split, { occurredOn }) : null;
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
    authorMemberId: opts.subscription?.authorMemberId ?? ctx.memberId,
    isSharedExpense: shared,
    ...(opts.subscription ? { origin: "SUBSCRIPTION" as const } : {}),
    ...(rule ? { splitMode: split.mode, splitRuleVersionId: rule.ruleVersionId } : {}),
    ...(opts.assistant
      ? {
          origin: "ASSISTANT" as const,
          assistantGrantId: opts.assistant.grantId,
          assistantIdemKey: opts.assistant.idemKey,
          createdAt: ctx.clock.now(), // o relógio do app (testes e janelas de limite usam o mesmo)
        }
      : {}),
  });
  if (rule) {
    await insertSplitRows(tx, ctx.familyId, {
      transactionId: row.id,
      amountInCents: input.amountInCents,
      payerMemberId,
      shares: rule.shares,
    });
  }
  const splits = rule
    ? await tx.transactionSplit.findMany({
        where: { familyId: ctx.familyId, transactionId: row.id },
        orderBy: { memberId: "asc" },
      })
    : [];
  const tags = await attachTagsOnCreate(tx, ctx, [row.id], input.tags); // US-045: mesma transação

  const dto = toTransactionDTO(
    { ...row, splits },
    {
      tags,
      account,
      card: card ? { id: card.id, name: card.name, color: card.color } : null,
      invoice: invoice
        ? { ref: invoice.ref, closingDate: invoice.closingDate, dueDate: invoice.dueDate }
        : null,
      category: categoryRefOf(category),
      members: memberRefsWithReturn(await repo.listMembers(), memberRefOf),
      ...(opts.assistant
        ? { assistantLabels: new Map([[opts.assistant.grantId, opts.assistant.label]]) }
        : {}),
    },
  );
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: row.id,
    revision: 1,
    action: "CREATE",
    actorMemberId: opts.subscription?.authorMemberId ?? ctx.memberId,
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
          isSharedExpense: shared,
          ...(shared && split.mode === "CUSTOM" ? { splitMode: "CUSTOM" } : {}),
          ...(tags.length > 0 ? { tags: tags.map((t) => t.name) } : {}),
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

/**
 * Receita em conta. Reutilizada pela baixa de receita prevista (US-051, SDD-017 §4.4), que aceita
 * categoria arquivada depois do cadastro (como o `createExpenseCore` na baixa da despesa).
 */
export async function createIncomeCore(
  tx: Tx,
  ctx: RequestContext,
  input: IncomeInput,
  opts: { allowArchivedCategory?: boolean } = {},
): Promise<CreateTransactionResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;

  const account = await repo.findAccount(input.accountId);
  if (!account) throw invalidRef("accountId", "Escolha uma conta");
  await lockAccountsForPosting(tx, ctx.familyId, [account.id]);
  const category = opts.allowArchivedCategory
    ? await repo.findCategoryAny(input.categoryId)
    : await repo.findCategory(input.categoryId);
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
  const tags = await attachTagsOnCreate(tx, ctx, [row.id], input.tags); // US-045

  const dto = toTransactionDTO(row, {
    tags,
    account,
    category: categoryRefOf(category),
    members: memberRefsWithReturn(await repo.listMembers(), memberRefOf),
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
          ...(tags.length > 0 ? { tags: tags.map((t) => t.name) } : {}),
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
  assistantLabels?: Map<string, string>,
): TransactionDTO {
  const dto = toTransactionDTO(r, {
    account: r.account
      ? {
          id: r.account.id,
          name: r.account.name,
          color: r.account.color,
          archived: r.account.archivedAt !== null,
        }
      : null,
    card: r.card
      ? {
          id: r.card.id,
          name: r.card.name,
          color: r.card.color,
          archived: r.card.archivedAt !== null,
        }
      : null,
    invoice: r.invoice
      ? {
          ref: r.invoice.referenceMonth,
          closingDate: fromDbDate(r.invoice.closingDate),
          dueDate: fromDbDate(r.invoice.dueDate),
        }
      : null,
    plannedExpenseId: r.paidPlanned?.id ?? null,
    tags: sortTagRefs(r.tags.map((l) => ({ id: l.tag.id, name: l.tag.name }))),
    accountOwnerId: r.account?.ownerMemberId ?? r.card?.ownerMemberId ?? null,
    category: r.category ? categoryRefOf(r.category) : null,
    members,
    ...(assistantLabels ? { assistantLabels } : {}),
  });
  return {
    ...dto,
    isSettlement: r.group?.kind === "SETTLEMENT",
    counterpartAccount: counterpart,
  };
}

/** Rótulos das conexões dos lançamentos "via assistente" (a conexão pode ter sido expurgada ⇒ sem rótulo). */
async function assistantLabelsOf(
  tx: Tx,
  familyId: string,
  rows: Array<{ assistantGrantId?: string | null }>,
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap((r) => (r.assistantGrantId ? [r.assistantGrantId] : [])))];
  if (ids.length === 0) return new Map();
  const grants = await tx.mcpGrant.findMany({
    where: { familyId, id: { in: ids } },
    select: { id: true, label: true },
  });
  return new Map(grants.map((g) => [g.id, g.label] as const));
}

async function memberMap(repo: ReturnType<typeof transacoesRepo>) {
  return memberRefsWithReturn(await repo.listMembers(), memberRefOf);
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
  opts: { occurredUntil?: string } = {},
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
    ...(opts.occurredUntil ? { occurredUntil: opts.occurredUntil } : {}),
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.cardId ? { cardId: q.cardId } : {}),
    ...(q.memberId ? { memberId: q.memberId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.categoryIds ? { categoryIds: q.categoryIds } : {}),
    ...(q.payerIds ? { payerIds: q.payerIds } : {}),
    ...(q.sourceIds ? { sourceIds: q.sourceIds } : {}),
    ...(q.tagIds ? { tagIds: q.tagIds } : {}),
    ...(q.untagged ? { untagged: true } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.shared !== undefined ? { shared: q.shared } : {}),
    ...(q.origin ? { origin: q.origin } : {}),
    ...(q.q ? { q: q.q } : {}),
  };

  const ids = await ledgerPageIds(tx, filters, cursor, q.limit);
  const hasMore = ids.length > q.limit;
  const pageIds = ids.slice(0, q.limit);
  const rows = await repo.findByIds(pageIds);
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const members = await memberMap(repo);
  const labels = await assistantLabelsOf(tx, ctx.familyId, rows);

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
    .map((r) => dtoFromLoaded(r, members, r.transferGroupId ? counterpartOf(r) : null, labels));

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
  const labels = await assistantLabelsOf(tx, ctx.familyId, [row]);
  return {
    transaction: {
      ...dtoFromLoaded(row, members, counterpart, labels),
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
  const labels = await assistantLabelsOf(tx, ctx.familyId, rows);
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => dtoFromLoaded(r, members, null, labels));
}
