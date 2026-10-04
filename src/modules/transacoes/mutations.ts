import { badRequest, conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { formatBRL, toCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { formatInvoiceLabel, invoiceRefFor } from "@/modules/cartoes/cycle";
import { getOrCreateInvoice, lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { splitRepo } from "@/modules/split/repo";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  RevisionDTO,
  TransactionStateInput,
  UpdateTransactionParsed,
  UpdateTransactionResponse,
} from "@/modules/transacoes/schemas";
import { getTransaction, memberRefOf } from "@/modules/transacoes/service";

const NOT_EDITABLE = "Transferências e acertos não podem ser editados. Use Desfazer.";
const INVOICE_PAID_LOCKED =
  "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.";
const LINKED_TO_PLANNED = "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.";
const PAYMENT_NOT_EDITABLE =
  "O pagamento de fatura não pode ser editado nem excluído. Use Desfazer pagamento.";
const SETTLED = "Este mês já foi acertado. O saldo do acerto será recalculado.";
const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

type Repo = ReturnType<typeof transacoesRepo>;
type Row = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;

async function loadMutable(repo: Repo, id: string): Promise<Row> {
  const row = await repo.findById(id);
  if (!row) throw notFound("Lançamento não encontrado.");
  if (row.kind === "INVOICE_PAYMENT") throw unprocessable("NOT_EDITABLE", PAYMENT_NOT_EDITABLE);
  if (row.kind !== "EXPENSE" && row.kind !== "INCOME") {
    throw unprocessable("NOT_EDITABLE", NOT_EDITABLE);
  }
  return row;
}

async function versionConflict(repo: Repo, id: string, memberById: Map<string, string>) {
  const fresh = await repo.findById(id);
  if (!fresh) return notFound("Lançamento não encontrado.");
  const by = fresh.updatedByMemberId ?? fresh.authorMemberId;
  const name = memberById.get(by) ?? "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Este lançamento foi alterado por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

async function memberNames(repo: Repo): Promise<Map<string, string>> {
  return new Map(
    (await repo.listMembers()).map((m) => [m.id, memberRefOf(m).name.split(" ")[0] ?? ""]),
  );
}

/** SDD-001 §4.2 passo 5 / §4.3: confirmação exigida quando o período de uma despesa comum já foi acertado. */
async function requireSettledConfirmation(
  tx: Tx,
  ctx: RequestContext,
  periods: Array<string | null>,
  confirmed: boolean | undefined,
) {
  if (confirmed) return;
  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  const keys = [...new Set(periods.filter((p): p is string => p !== null))].map(
    (date) => periodOf(date, cutDay).key,
  );
  const settled: string[] = [];
  for (const key of keys) {
    if (await splitRepo(tx, ctx.familyId).hasActiveSettlement(key)) settled.push(key);
  }
  if (settled.length > 0) {
    throw conflict("SETTLED_PERIOD_CONFIRMATION_REQUIRED", SETTLED, { periods: settled });
  }
}

const paidLocked = () => unprocessable("INVOICE_PAID_LOCKED", INVOICE_PAID_LOCKED);

/**
 * Compra no cartão (SDD-008 §4.6): trava a fatura (as duas, em ordem crescente de `ref`, se a data
 * muda de ciclo) e recusa se qualquer uma tem pagamento ativo. Devolve a nova fatura, se mudou.
 */
async function lockPurchaseInvoices(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  row: Row,
  newOccurredOn?: string,
): Promise<{ newInvoiceId?: string }> {
  const invoiceId = row.invoiceId as string;
  const oldRef = row.invoice?.referenceMonth as string;
  const card = await repo.findCard(row.cardId as string);
  const newRef = newOccurredOn && card ? invoiceRefFor(newOccurredOn, card.closingDay) : oldRef;
  let newInvoiceId: string | undefined;
  if (card && newRef !== oldRef) {
    if (newRef < oldRef) {
      newInvoiceId = (await getOrCreateInvoice(tx, ctx.familyId, card, newRef)).id;
      await lockInvoices(tx, ctx.familyId, [invoiceId]);
    } else {
      await lockInvoices(tx, ctx.familyId, [invoiceId]);
      newInvoiceId = (await getOrCreateInvoice(tx, ctx.familyId, card, newRef)).id;
    }
  } else {
    await lockInvoices(tx, ctx.familyId, [invoiceId]);
  }
  const ids = newInvoiceId ? [invoiceId, newInvoiceId] : [invoiceId];
  if ((await activePayments(tx, ctx.familyId, ids)).size > 0) throw paidLocked();
  return newInvoiceId ? { newInvoiceId } : {};
}

async function respond(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<UpdateTransactionResponse> {
  const { transaction } = await getTransaction(tx, ctx, id);
  if (transaction.card && !transaction.account) {
    const card = await transacoesRepo(tx, ctx.familyId).findCard(transaction.card.id);
    const used =
      (await cardUsage(tx, ctx.familyId, [transaction.card.id])).get(transaction.card.id) ?? 0;
    return {
      transaction,
      card: {
        id: transaction.card.id,
        usedInCents: used,
        availableInCents: toCents(card?.limitInCents ?? 0n) - used,
      },
    };
  }
  const accountId = (transaction.account as { id: string }).id;
  const balance = (await accountBalances(tx, ctx.familyId, [accountId])).get(accountId) ?? 0;
  return { transaction, account: { id: accountId, balanceInCents: balance } };
}

/** PATCH /transactions/:id (SDD-001 §4.2). */
export async function updateTransaction(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateTransactionParsed,
): Promise<UpdateTransactionResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await loadMutable(repo, id);
  if (row.deletedAt) {
    throw unprocessable(
      "TRANSACTION_DELETED",
      "Este lançamento foi excluído. Restaure para editar.",
    );
  }
  if (row.kind === "INCOME" && input.isSharedExpense !== undefined) {
    throw badRequest("VALIDATION_ERROR", "Receita não pode ser dividida com a família", [
      { path: "isSharedExpense", message: "Receita não pode ser dividida com a família" },
    ]);
  }
  const today = todayInFamilyTz(ctx.clock);

  if (row.cardId && input.accountId !== undefined) {
    throw unprocessable(
      "PAYMENT_SOURCE_NOT_EDITABLE",
      "Para mudar a forma de pagamento, exclua e lance novamente",
      [{ path: "accountId", message: "Para mudar a forma de pagamento, exclua e lance novamente" }],
    );
  }
  const account = input.accountId ? await repo.findAccount(input.accountId) : null;
  if (input.accountId && !account) throw invalidRef("accountId", "Escolha uma conta");
  // SDD-007 §1: a validação "categoria ativa" só roda quando a categoria enviada difere da atual.
  const changesCategory = input.categoryId !== undefined && input.categoryId !== row.categoryId;
  const category =
    changesCategory && input.categoryId ? await repo.findCategory(input.categoryId) : null;
  if (changesCategory && !category) throw invalidRef("categoryId", "Escolha uma categoria");
  if (category && category.kind !== row.kind) {
    throw unprocessable(
      "CATEGORY_KIND_MISMATCH",
      "A categoria não combina com o tipo do lançamento",
      [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
    );
  }
  if (input.payerMemberId && !(await repo.findMember(input.payerMemberId))) {
    throw invalidRef("payerMemberId", "Membro inválido");
  }
  if (input.occurredOn && compareDate(input.occurredOn, today) > 0) {
    const message = row.cardId
      ? "A data da compra não pode ser futura"
      : row.kind === "EXPENSE"
        ? "Para contas futuras, use Despesa prevista"
        : "A data da receita não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }

  // diferenças campo a campo (valores normalizados)
  const before = {
    accountId: row.accountId,
    categoryId: row.categoryId,
    amountInCents: toCents(row.amountInCents),
    occurredOn: fromDbDate(row.occurredOn),
    payerMemberId: row.payerMemberId,
    description: row.description,
    note: row.note,
    isSharedExpense: row.isSharedExpense,
  };
  type Fields = {
    accountId: string;
    categoryId: string;
    amountInCents: number;
    occurredOn: string;
    payerMemberId: string;
    description: string;
    note: string | null;
    isSharedExpense: boolean;
  };
  const wanted: Partial<Fields> = {};
  for (const k of Object.keys(before) as Array<keyof typeof before>) {
    const v = input[k];
    if (v !== undefined && v !== before[k]) (wanted as Record<string, unknown>)[k] = v;
  }
  if (input.note === null && row.note === null) delete wanted.note;
  const keys = Object.keys(wanted) as Array<keyof Fields>;
  if (keys.length === 0) return respond(tx, ctx, id);

  const touchesSettlement = keys.some((k) =>
    ["amountInCents", "occurredOn", "payerMemberId", "isSharedExpense"].includes(k),
  );
  const sharedBefore = row.kind === "EXPENSE" && row.isSharedExpense;
  const sharedAfter = row.kind === "EXPENSE" && (wanted.isSharedExpense ?? row.isSharedExpense);
  if (touchesSettlement && (sharedBefore || sharedAfter)) {
    await requireSettledConfirmation(
      tx,
      ctx,
      [before.occurredOn, wanted.occurredOn ?? null],
      input.confirmSettledPeriod,
    );
  }

  const locked = row.cardId
    ? await lockPurchaseInvoices(tx, ctx, repo, row, wanted.occurredOn)
    : {};
  const res = await repo.updateVersioned(id, input.version, {
    ...(wanted.accountId !== undefined ? { accountId: wanted.accountId } : {}),
    ...("newInvoiceId" in locked && locked.newInvoiceId ? { invoiceId: locked.newInvoiceId } : {}),
    ...(wanted.categoryId !== undefined ? { categoryId: wanted.categoryId } : {}),
    ...(wanted.amountInCents !== undefined ? { amountInCents: wanted.amountInCents } : {}),
    ...(wanted.occurredOn !== undefined ? { occurredOn: wanted.occurredOn } : {}),
    ...(wanted.payerMemberId !== undefined ? { payerMemberId: wanted.payerMemberId } : {}),
    ...(wanted.description !== undefined ? { description: wanted.description } : {}),
    ...(wanted.note !== undefined ? { note: wanted.note } : {}),
    ...(wanted.isSharedExpense !== undefined ? { isSharedExpense: wanted.isSharedExpense } : {}),
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(repo, id, await memberNames(repo));

  const changes: Change[] = keys.map((field) => ({
    field,
    from: before[field],
    to: wanted[field],
  }));
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: id,
    revision: input.version + 1,
    action: "UPDATE",
    actorMemberId: ctx.memberId,
    changes,
  });
  return respond(tx, ctx, id);
}

/** POST /transactions/:id/delete (SDD-001 §4.3). */
export async function deleteTransaction(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: TransactionStateInput,
): Promise<{ transaction: UpdateTransactionResponse["transaction"] }> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await loadMutable(repo, id);
  if (row.deletedAt) throw conflict("ALREADY_DELETED", "Este lançamento já foi excluído.");
  if (row.paidPlanned) throw unprocessable("LINKED_TO_PLANNED", LINKED_TO_PLANNED);
  if (row.cardId) await lockPurchaseInvoices(tx, ctx, repo, row);
  if (row.kind === "EXPENSE" && row.isSharedExpense) {
    await requireSettledConfirmation(
      tx,
      ctx,
      [fromDbDate(row.occurredOn)],
      input.confirmSettledPeriod,
    );
  }
  const now = ctx.clock.now();
  const res = await repo.markDeleted(id, input.version, ctx.memberId, now);
  if (res.count === 0) throw await versionConflict(repo, id, await memberNames(repo));
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: id,
    revision: input.version + 1,
    action: "DELETE",
    actorMemberId: ctx.memberId,
    changes: [{ field: "deletionReason", from: null, to: "DELETED" }],
  });
  return { transaction: (await getTransaction(tx, ctx, id)).transaction };
}

/** POST /transactions/:id/restore (SDD-001 §4.3). */
export async function restoreTransaction(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: TransactionStateInput,
): Promise<{ transaction: UpdateTransactionResponse["transaction"] }> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await loadMutable(repo, id);
  if (row.paidPlanned) throw unprocessable("LINKED_TO_PLANNED", LINKED_TO_PLANNED);
  if (!row.deletedAt || row.deletionReason !== "DELETED") {
    throw unprocessable("NOT_RESTORABLE", "Este lançamento não pode ser restaurado.");
  }
  if (row.cardId) await lockPurchaseInvoices(tx, ctx, repo, row);
  if (row.kind === "EXPENSE" && row.isSharedExpense) {
    await requireSettledConfirmation(
      tx,
      ctx,
      [fromDbDate(row.occurredOn)],
      input.confirmSettledPeriod,
    );
  }
  const res = await repo.markRestored(id, input.version, ctx.memberId);
  if (res.count === 0) throw await versionConflict(repo, id, await memberNames(repo));
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: id,
    revision: input.version + 1,
    action: "RESTORE",
    actorMemberId: ctx.memberId,
    changes: [{ field: "deletionReason", from: "DELETED", to: null }],
  });
  return { transaction: (await getTransaction(tx, ctx, id)).transaction };
}

const FIELD_LABELS: Record<string, string> = {
  amountInCents: "Valor",
  description: "Descrição",
  categoryId: "Categoria",
  occurredOn: "Data",
  payerMemberId: "Quem pagou",
  isSharedExpense: "Dividir com a família",
  accountId: "Conta",
  note: "Observação",
  deletionReason: "Situação",
  "*": "Criação",
};

/** GET /transactions/:id/history (SDD-001 §3): mais recente primeiro, com rótulos resolvidos. */
export async function listHistory(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ items: RevisionDTO[] }> {
  const repo = transacoesRepo(tx, ctx.familyId);
  if (!(await repo.findById(id))) throw notFound("Lançamento não encontrado.");
  const members = new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const));
  const accounts = new Map(
    (
      await tx.bankAccount.findMany({
        where: { familyId: ctx.familyId },
        select: { id: true, name: true },
      })
    ).map((a) => [a.id, a.name] as const),
  );
  const categories = new Map((await repo.listAllCategories()).map((c) => [c.id, c.name] as const));
  const label = (field: string, v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (field === "accountId") return accounts.get(String(v));
    if (field === "categoryId") return categories.get(String(v));
    if (field === "payerMemberId") return members.get(String(v))?.name;
    if (field === "amountInCents") return formatBRL(Number(v));
    if (field === "isSharedExpense") return v ? "Comum" : "Pessoal";
    return undefined;
  };
  const rows = await repo.listRevisions(id);
  return {
    items: rows.map((r) => ({
      revision: r.revision,
      action: r.action,
      at: r.at.toISOString(),
      actor: members.get(r.actorMemberId) ?? { id: r.actorMemberId, name: "Membro", image: null },
      changes: (r.changes as Change[]).map((c) => {
        const fromLabel = label(c.field, c.from);
        const toLabel = label(c.field, c.to);
        return {
          field: c.field,
          label: FIELD_LABELS[c.field] ?? c.field,
          from: c.from,
          to: c.to,
          ...(fromLabel !== undefined ? { fromLabel } : {}),
          ...(toLabel !== undefined ? { toLabel } : {}),
        };
      }),
    })),
  };
}
