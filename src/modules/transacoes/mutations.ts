import { badRequest, conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { formatInvoiceLabel, invoiceRefFor } from "@/modules/cartoes/cycle";
import { getOrCreateInvoice, lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import {
  assertAccountsEditable,
  lockAccountsForPosting,
  shareLockAccounts,
  shareLockCards,
} from "@/modules/contas/lock";
import { assertImportNotReverted } from "@/modules/importacao/revert-guard";
import { plannedCopy } from "@/modules/previstas/copy";
import { assertCanShare } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { splitRepo } from "@/modules/split/repo";
import {
  clearSplitRows,
  insertSplitRows,
  resolveSplit,
  rewriteSplitAmounts,
} from "@/modules/split/write";
import { replaceTags, type TagSetChange } from "@/modules/tags/service";
import {
  adminFullPower,
  assertCanMakePersonal,
  assertCanWriteTransaction,
  isActiveUnlinked,
  isPersonalExpense,
  type OwnerStanding,
  ownerStanding,
  personalOwnerId,
} from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  TransactionStateInput,
  UpdateTransactionParsed,
  UpdateTransactionResponse,
} from "@/modules/transacoes/schemas";
import { getTransaction, memberRefOf } from "@/modules/transacoes/service";
import { planSplitChange } from "@/modules/transacoes/split-edit";

const NOT_EDITABLE = "Transferências e acertos não podem ser editados. Use Desfazer.";
const INVOICE_PAID_LOCKED =
  "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.";
const INSTALLMENT_SCOPE_REQUIRED =
  "Informe o alcance da edição da parcela: somente esta ou esta e as próximas.";
const linkedToPlanned = (kind: "EXPENSE" | "INCOME") => plannedCopy(kind).linkedToPlanned;
const PAYMENT_NOT_EDITABLE =
  "O pagamento de fatura não pode ser editado nem excluído. Use Desfazer pagamento.";
const SETTLED = "Este mês já foi acertado. O saldo do acerto será recalculado.";
const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

type Repo = ReturnType<typeof transacoesRepo>;
type Row = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;

async function loadMutable(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  id: string,
  extraAccountIds: Array<string | null | undefined> = [],
): Promise<Row> {
  const familyId = ctx.familyId;
  const row = await repo.findById(id);
  if (!row) throw notFound("Lançamento não encontrado.");
  // SDD-034 R2: contas (atual e nova) ANTES de qualquer leitura do dono (conta ➔ membro, como o removal.ts)
  await shareLockAccounts(tx, familyId, [row.accountId, ...extraAccountIds]);
  await shareLockCards(tx, familyId, [row.cardId]);
  await assertCanWriteTransaction(tx, ctx, row); // SEC-021: "Só meu" é só do dono
  await assertAccountsEditable(tx, familyId, [row.accountId]); // conta arquivada: lançamento travado
  if (row.kind === "INVOICE_PAYMENT") throw unprocessable("NOT_EDITABLE", PAYMENT_NOT_EDITABLE);
  if (row.kind !== "EXPENSE" && row.kind !== "INCOME") {
    throw unprocessable("NOT_EDITABLE", NOT_EDITABLE);
  }
  // US-041: parcela só edita com `scope` (as rotas desviam para `installment-edit.ts`)
  if (row.installmentPlanId) {
    throw badRequest("VALIDATION_ERROR", INSTALLMENT_SCOPE_REQUIRED, [
      { path: "scope", message: INSTALLMENT_SCOPE_REQUIRED },
    ]);
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

export async function memberNames(repo: Repo): Promise<Map<string, string>> {
  return new Map(
    (await repo.listMembers()).map((m) => [m.id, memberRefOf(m).name.split(" ")[0] ?? ""]),
  );
}

/** SDD-001 §4.2 passo 5 / §4.3: confirmação exigida quando o período de uma despesa comum já foi acertado. */
export async function requireSettledConfirmation(
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

const FINANCIAL_KEYS = [
  "accountId",
  "categoryId",
  "amountInCents",
  "occurredOn",
  "payerMemberId",
  "description",
  "note",
  "isSharedExpense",
  "split",
] as const;

/** SDD-016 §1: PATCH cujos campos ⊆ { tags } é edição NÃO financeira (não pede acerto, não é barrada por fatura/conta/parcela). */
const isTagsOnly = (input: UpdateTransactionParsed) =>
  input.tags !== undefined && FINANCIAL_KEYS.every((k) => input[k] === undefined);

const tagNames = (tags: Array<{ name: string }>) => tags.map((t) => t.name);

/**
 * US-045 (SDD-016 §4.2): troca só o conjunto de tags. Tag não altera saldo, fatura nem acerto: vale em
 * fatura paga, conta arquivada e parcela; só o lançamento EXCLUÍDO barra. Em compra parcelada o conjunto
 * vale para TODAS as parcelas (plano travado antes das parcelas). Sem diferença: 200 sem `version + 1`.
 */
async function updateTagsOnly(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  id: string,
  input: UpdateTransactionParsed,
): Promise<UpdateTransactionResponse> {
  const row = await repo.findById(id);
  if (!row) throw notFound("Lançamento não encontrado.");
  await assertCanWriteTransaction(tx, ctx, row); // SEC-021: "Só meu" é só do dono
  if (row.kind === "INVOICE_PAYMENT") throw unprocessable("NOT_EDITABLE", PAYMENT_NOT_EDITABLE);
  if (row.kind !== "EXPENSE" && row.kind !== "INCOME") {
    throw unprocessable("NOT_EDITABLE", NOT_EDITABLE);
  }
  const deleted = () =>
    unprocessable("TRANSACTION_DELETED", "Este lançamento foi excluído. Restaure para editar.");
  if (row.deletedAt) throw deleted();

  type Parcel = { id: string; version: number; deletedAt: Date | null };
  let parcels: Parcel[] = [{ id: row.id, version: row.version, deletedAt: row.deletedAt }];
  if (row.installmentPlanId) {
    await tx.$executeRaw`SELECT 1 FROM installment_plans
      WHERE id = ${row.installmentPlanId}::uuid AND "familyId" = ${ctx.familyId}::uuid FOR UPDATE`;
    parcels = await tx.transaction.findMany({
      where: { familyId: ctx.familyId, installmentPlanId: row.installmentPlanId },
      select: { id: true, version: true, deletedAt: true },
      orderBy: [{ installmentNo: "asc" }],
    });
  }
  const target = parcels.find((p) => p.id === id);
  if (!target) throw notFound("Lançamento não encontrado.");
  if (target.deletedAt) throw deleted();

  const diffs = new Map<string, TagSetChange>(
    (
      await replaceTags(
        tx,
        ctx,
        parcels.map((p) => p.id),
        input.tags ?? [],
      )
    ).map((c) => [c.transactionId, c] as const),
  );
  const targetDiff = diffs.get(id);
  if (targetDiff?.changed && target.version !== input.version) {
    throw await versionConflict(repo, id, await memberNames(repo)); // a transação inteira é desfeita
  }
  for (const p of parcels) {
    const diff = diffs.get(p.id);
    if (!diff?.changed || p.deletedAt) continue; // excluídas ficam com o conjunto novo, sem revisão
    const res = await tx.transaction.updateMany({
      where: { id: p.id, familyId: ctx.familyId, version: p.version, deletedAt: null },
      data: { updatedByMemberId: ctx.memberId, version: { increment: 1 } },
    });
    if (res.count === 0) throw await versionConflict(repo, id, await memberNames(repo));
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: p.id,
      revision: p.version + 1,
      action: "UPDATE",
      actorMemberId: ctx.memberId,
      changes: [{ field: "tags", from: tagNames(diff.before), to: tagNames(diff.after) }],
    });
  }
  return respond(tx, ctx, id);
}

/** PATCH /transactions/:id (SDD-001 §4.2). */
export async function updateTransaction(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateTransactionParsed,
): Promise<UpdateTransactionResponse> {
  const engine = await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const repo = transacoesRepo(tx, ctx.familyId);
  if (isTagsOnly(input)) return updateTagsOnly(tx, ctx, repo, id, input);
  const row = await loadMutable(tx, ctx, repo, id, [input.accountId]);
  // D-GES-55: Administrador atual sobre o "Só meu" de ex-membro tem poderes plenos
  // SEC-051 (D-GES-59): o pagador ex-membro (sem retorno) é imutável também na dividida
  const standing: OwnerStanding =
    row.kind === "EXPENSE"
      ? await ownerStanding(
          tx,
          ctx,
          personalOwnerId(row),
          [row.accountId, input.accountId],
          [row.cardId],
        )
      : { ownerIsActor: false, ownerRemoved: false, ownerUnlinked: false };
  // US-093b: o tutor (Admin sobre dono sem conta) tem os mesmos poderes plenos do Admin sobre ex-membro
  const fullPower = adminFullPower(ctx, standing) && isPersonalExpense(row);
  // US-043: `split` vale como `isSharedExpense` para as travas de propriedade ("Só meu" x dividida)
  const ownershipNext = {
    ...input,
    isSharedExpense:
      input.isSharedExpense ?? (input.split ? input.split.mode !== "NONE" : undefined),
  };
  assertCanMakePersonal(ctx, row, ownershipNext, {
    fullPower,
    ownerIsActor: standing.ownerIsActor && isPersonalExpense(row), // SEC-049
    payerGone: standing.ownerRemoved,
    // SEC-059a: pagador para/de sem conta só pelo lançador ou Administrador (nunca para si, se Admin)
    unlinked: {
      currentUnlinked: standing.ownerUnlinked,
      nextUnlinked: await isActiveUnlinked(tx, ctx, input.payerMemberId),
    },
  });
  if (row.deletedAt) {
    throw unprocessable(
      "TRANSACTION_DELETED",
      "Este lançamento foi excluído. Restaure para editar.",
    );
  }
  if (row.kind === "INCOME" && (input.isSharedExpense !== undefined || input.split !== undefined)) {
    throw badRequest("VALIDATION_ERROR", "Receita não pode ser dividida com a família", [
      { path: "isSharedExpense", message: "Receita não pode ser dividida com a família" },
    ]);
  }
  const plan = await planSplitChange(tx, ctx.familyId, row, input);
  if (plan.changed && plan.target?.mode !== "NONE") await assertCanShare(tx, ctx);
  if (plan.changed && plan.target?.mode === "CUSTOM" && engine !== "STORED") {
    throw unprocessable(
      "CUSTOM_SPLIT_UNAVAILABLE",
      "Esta família ainda não aceita divisão personalizada",
    );
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
  if (account) await lockAccountsForPosting(tx, ctx.familyId, [account.id]);
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
  if (
    input.payerMemberId &&
    input.payerMemberId !== row.payerMemberId &&
    !(await repo.findMember(input.payerMemberId))
  ) {
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
  // `isSharedExpense` do modo efetivo: só entra em `wanted` quando a divisão liga/desliga (como antes)
  delete wanted.isSharedExpense;
  const sharedBefore = plan.modeBefore !== "NONE";
  const sharedAfter = plan.target ? plan.target.mode !== "NONE" : sharedBefore;
  if (plan.changed && sharedAfter !== row.isSharedExpense) wanted.isSharedExpense = sharedAfter;
  const keys = Object.keys(wanted) as Array<keyof Fields>;
  if (keys.length === 0 && !plan.changed) {
    // nada financeiro mudou: só as tags (se vieram) ainda podem mudar
    return input.tags === undefined
      ? respond(tx, ctx, id)
      : updateTagsOnly(tx, ctx, repo, id, input);
  }

  const touchesSettlement =
    plan.changed ||
    keys.some((k) =>
      ["amountInCents", "occurredOn", "payerMemberId", "isSharedExpense"].includes(k),
    );
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

  // EN-002a (SDD-015 §4.3): famílias STORED mantêm o rateio junto do lançamento, na mesma transação
  const stored = engine === "STORED" && row.kind === "EXPENSE";
  const becomesPersonal = stored && sharedBefore && !sharedAfter;
  // vira dividida OU troca de modo/percentuais (RULE <-> CUSTOM, CUSTOM com outros bps): resolve e regrava
  const resolve = stored && plan.changed && plan.target && sharedAfter ? plan.target : null;
  const rule = resolve
    ? await resolveSplit(tx, ctx.familyId, resolve, {
        occurredOn: wanted.occurredOn ?? before.occurredOn,
      })
    : null;
  const res = await repo.updateVersioned(id, input.version, {
    ...(rule && resolve ? { splitMode: resolve.mode, splitRuleVersionId: rule.ruleVersionId } : {}),
    ...(becomesPersonal ? { splitMode: "NONE" as const, splitRuleVersionId: null } : {}),
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
  if (stored) {
    const amountAfter = wanted.amountInCents ?? before.amountInCents;
    const payerAfter = (wanted.payerMemberId ?? before.payerMemberId) as string;
    if (rule) {
      if (sharedBefore) await clearSplitRows(tx, ctx.familyId, id);
      await insertSplitRows(tx, ctx.familyId, {
        transactionId: id,
        amountInCents: amountAfter,
        payerMemberId: payerAfter,
        shares: rule.shares,
      });
    } else if (becomesPersonal) {
      await clearSplitRows(tx, ctx.familyId, id);
    } else if (
      sharedBefore &&
      sharedAfter &&
      (wanted.amountInCents !== undefined || wanted.payerMemberId !== undefined)
    ) {
      await rewriteSplitAmounts(tx, ctx.familyId, {
        transactionId: id,
        amountInCents: amountAfter,
        payerMemberId: payerAfter,
      });
    }
  }

  const changes: Change[] = keys.map((field) => ({
    field,
    from: before[field],
    to: wanted[field],
  }));
  if (plan.changed && plan.target) {
    changes.push({ field: "split", from: plan.modeBefore, to: plan.target.mode });
  }
  if (input.tags !== undefined) {
    const [diff] = await replaceTags(tx, ctx, [id], input.tags);
    if (diff?.changed) {
      changes.push({ field: "tags", from: tagNames(diff.before), to: tagNames(diff.after) });
    }
  }
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
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: o rateio acompanha o lançamento (linhas intactas)
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await loadMutable(tx, ctx, repo, id);
  if (row.deletedAt) throw conflict("ALREADY_DELETED", "Este lançamento já foi excluído.");
  if (row.paidPlanned)
    throw unprocessable("LINKED_TO_PLANNED", linkedToPlanned(row.paidPlanned.kind));
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
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2
  const repo = transacoesRepo(tx, ctx.familyId);
  const row = await loadMutable(tx, ctx, repo, id);
  if (row.paidPlanned)
    throw unprocessable("LINKED_TO_PLANNED", linkedToPlanned(row.paidPlanned.kind));
  if (!row.deletedAt || row.deletionReason !== "DELETED") {
    throw unprocessable("NOT_RESTORABLE", "Este lançamento não pode ser restaurado.");
  }
  await assertImportNotReverted(tx, ctx, row.importBatchId); // US-069: lote desfeito não volta
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
