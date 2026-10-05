import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { previstasRepo } from "@/modules/previstas/repo";
import { isPlannedOverdue, plannedDifference } from "@/modules/previstas/rules";
import type {
  CreatePlannedExpenseParsed,
  ListPlannedQuery,
  PayPlannedExpenseParsed,
  PayPlannedResponse,
  PlannedExpenseDTO,
  PlannedListResponse,
  UpdatePlannedExpenseParsed,
} from "@/modules/previstas/schemas";
import { assertCanShare } from "@/modules/split/guard";
import { createExpenseCore } from "@/modules/transacoes/service";

type Repo = ReturnType<typeof previstasRepo>;
export type PlannedRow = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;
type MemberRow = Awaited<ReturnType<Repo["listMembers"]>>[number];

const NOT_FOUND = "Despesa prevista não encontrada.";

export const memberRefOf = (m: MemberRow): MemberRef => ({
  id: m.id,
  name: m.user.name ?? localPart(m.user.email),
  image: m.user.image,
  ...(m.removedAt ? { removed: true as const } : {}),
});

export async function memberMap(repo: Repo): Promise<Map<string, MemberRef>> {
  return new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const));
}

const unknownMember = (id: string): MemberRef => ({ id, name: "Membro", image: null });

/** Monta o DTO; o valor pago vem SEMPRE da Transaction gerada (fonte única, SDD-009 §1). */
export function toPlannedDTO(
  row: PlannedRow,
  members: Map<string, MemberRef>,
  today: string,
): PlannedExpenseDTO {
  const ref = (id: string) => members.get(id) ?? unknownMember(id);
  const planned = toCents(row.amountInCents);
  const dueOn = fromDbDate(row.dueOn);
  const paidTx = row.paidTx;
  return {
    id: row.id,
    description: row.description,
    amountInCents: planned,
    dueOn,
    status: row.status,
    isOverdue: isPlannedOverdue({ status: row.status, dueOn }, today),
    category: {
      id: row.category.id,
      name: row.category.name,
      icon: row.category.icon,
      archived: row.category.archivedAt !== null,
    },
    responsible: ref(row.responsibleMemberId),
    author: ref(row.authorMemberId),
    updatedBy: row.updatedByMemberId ? ref(row.updatedByMemberId) : null,
    isSharedExpense: row.isSharedExpense,
    note: row.note,
    paid:
      row.status === "PAGO" && paidTx
        ? {
            transactionId: paidTx.id,
            accountId: paidTx.accountId ?? "",
            accountName: paidTx.account?.name ?? "",
            paidOn: fromDbDate(paidTx.occurredOn),
            amountInCents: toCents(paidTx.amountInCents),
            differenceInCents: plannedDifference(planned, toCents(paidTx.amountInCents)),
            payer: ref(paidTx.payerMemberId ?? row.responsibleMemberId),
          }
        : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

async function checkCategory(repo: Repo, categoryId: string) {
  const category = await repo.findCategory(categoryId);
  if (!category || category.archivedAt !== null || category.kind !== "EXPENSE") {
    throw invalidRef("categoryId", "Escolha uma categoria");
  }
}

async function loadDTO(tx: Tx, ctx: RequestContext, id: string): Promise<PlannedExpenseDTO> {
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  return toPlannedDTO(row, await memberMap(repo), todayInFamilyTz(ctx.clock));
}

/** US-018 (SDD-009 §4.1): nenhuma escrita no ledger. */
export async function createPlannedExpense(
  tx: Tx,
  ctx: RequestContext,
  input: CreatePlannedExpenseParsed,
): Promise<{ plannedExpense: PlannedExpenseDTO }> {
  const repo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const responsibleMemberId = input.responsibleMemberId ?? ctx.memberId;
  if (input.isSharedExpense) await assertCanShare(tx, ctx);
  await checkCategory(repo, input.categoryId);
  if (!(await repo.findMember(responsibleMemberId))) {
    throw invalidRef("responsibleMemberId", "Responsável inválido");
  }
  const row = await repo.insert({
    description: input.description,
    amountInCents: input.amountInCents,
    dueOn: input.dueOn ?? today,
    categoryId: input.categoryId,
    responsibleMemberId,
    isSharedExpense: input.isSharedExpense,
    note: input.note ?? null,
    authorMemberId: ctx.memberId,
  });
  return { plannedExpense: toPlannedDTO(row, await memberMap(repo), today) };
}

export async function getPlannedExpense(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ plannedExpense: PlannedExpenseDTO }> {
  return { plannedExpense: await loadDTO(tx, ctx, id) };
}

/** GET /planned-expenses (SDD-009 §4.6). */
export async function listPlannedExpenses(
  tx: Tx,
  ctx: RequestContext,
  q: ListPlannedQuery,
): Promise<PlannedListResponse> {
  const repo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const cutDay = await repo.cutDay();
  const period = q.period ? periodFromKey(q.period, cutDay) : periodOf(today, cutDay);
  const rows = await repo.listInRange(period.start, period.end, q.status);
  const members = await memberMap(repo);
  const items = rows.map((r) => toPlannedDTO(r, members, today));
  const open = items.filter((i) => i.status === "PREVISTO");
  const overdue = open.filter((i) => i.isOverdue);
  return {
    items,
    period: { key: period.key, start: period.start, end: period.end },
    totals: {
      plannedInCents: open.reduce((s, i) => s + i.amountInCents, 0),
      overdueInCents: overdue.reduce((s, i) => s + i.amountInCents, 0),
      overdueCount: overdue.length,
      paidInCents: items.reduce((s, i) => s + (i.paid?.amountInCents ?? 0), 0),
      count: items.length,
    },
  };
}

async function versionConflict(repo: Repo, tx: Tx, familyId: string, id: string) {
  const fresh = await tx.plannedExpense.findFirst({ where: { id, familyId, deletedAt: null } });
  if (!fresh) return notFound(NOT_FOUND);
  const by = fresh.updatedByMemberId ?? fresh.authorMemberId;
  const name = (await memberMap(repo)).get(by)?.name.split(" ")[0] ?? "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta despesa prevista foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

export const PLANNED_PAID_LOCKED_MESSAGE =
  "Despesa prevista paga não pode ser alterada. Use Desfazer pagamento.";

/** Carrega travada; versão divergente => 409; paga => 422 (ordem fixa, SDD-009 §4.2). */
async function loadForChange(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  id: string,
  version: number,
): Promise<PlannedRow> {
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  await repo.lock(id);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.version !== version) throw await versionConflict(repo, tx, ctx.familyId, id);
  if (row.status === "PAGO") {
    throw unprocessable("PLANNED_PAID_LOCKED", PLANNED_PAID_LOCKED_MESSAGE);
  }
  return row;
}

/** SDD-009 §4.2: sem diferença efetiva => 200 sem mudar `version`. */
export async function updatePlannedExpense(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdatePlannedExpenseParsed,
): Promise<{ plannedExpense: PlannedExpenseDTO }> {
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await loadForChange(tx, ctx, repo, id, input.version);
  if (input.categoryId !== undefined && input.categoryId !== row.categoryId) {
    await checkCategory(repo, input.categoryId);
  }
  if (
    input.responsibleMemberId !== undefined &&
    input.responsibleMemberId !== row.responsibleMemberId &&
    !(await repo.findMember(input.responsibleMemberId))
  ) {
    throw invalidRef("responsibleMemberId", "Responsável inválido");
  }
  if (input.isSharedExpense === true && !row.isSharedExpense) await assertCanShare(tx, ctx);
  const dueOn = fromDbDate(row.dueOn);
  const wanted = {
    ...(input.description !== undefined && input.description !== row.description
      ? { description: input.description }
      : {}),
    ...(input.amountInCents !== undefined && input.amountInCents !== toCents(row.amountInCents)
      ? { amountInCents: input.amountInCents }
      : {}),
    ...(input.dueOn !== undefined && input.dueOn !== dueOn ? { dueOn: input.dueOn } : {}),
    ...(input.categoryId !== undefined && input.categoryId !== row.categoryId
      ? { categoryId: input.categoryId }
      : {}),
    ...(input.responsibleMemberId !== undefined &&
    input.responsibleMemberId !== row.responsibleMemberId
      ? { responsibleMemberId: input.responsibleMemberId }
      : {}),
    ...(input.isSharedExpense !== undefined && input.isSharedExpense !== row.isSharedExpense
      ? { isSharedExpense: input.isSharedExpense }
      : {}),
    ...(input.note !== undefined &&
    input.note !== row.note &&
    !(input.note === null && row.note === null)
      ? { note: input.note }
      : {}),
  };
  if (Object.keys(wanted).length === 0) return { plannedExpense: await loadDTO(tx, ctx, id) };
  const res = await repo.updateVersioned(id, input.version, {
    ...wanted,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(repo, tx, ctx.familyId, id);
  return { plannedExpense: await loadDTO(tx, ctx, id) };
}

export async function deletePlannedExpense(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ deleted: true }> {
  const repo = previstasRepo(tx, ctx.familyId);
  await loadForChange(tx, ctx, repo, id, version);
  const res = await repo.markDeleted(id, version, ctx.memberId, ctx.clock.now());
  if (res.count === 0) throw await versionConflict(repo, tx, ctx.familyId, id);
  return { deleted: true };
}

async function loadForPay(
  tx: Tx,
  ctx: RequestContext,
  repo: Repo,
  id: string,
  version: number,
): Promise<PlannedRow> {
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  await repo.lock(id);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  // Ordem fixa (SDD-009 §1): versão divergente primeiro, depois a situação.
  if (row.version !== version) throw await versionConflict(repo, tx, ctx.familyId, id);
  return row;
}

/**
 * US-019 (SDD-009 §4.3): a baixa cria a despesa real pelo MESMO serviço da US-005 e marca a
 * previsão como PAGO, na mesma transação. O valor pago vive só na Transaction gerada.
 */
export async function payPlannedExpense(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: PayPlannedExpenseParsed,
): Promise<PayPlannedResponse> {
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await loadForPay(tx, ctx, repo, id, input.version);
  if (row.status === "PAGO") {
    throw conflict("PLANNED_ALREADY_PAID", "Esta despesa prevista já foi paga");
  }
  const today = todayInFamilyTz(ctx.clock);
  const paidOn = input.paidOn ?? today;
  if (compareDate(paidOn, today) > 0) {
    const message = "A data do pagamento não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "paidOn", message }]);
  }
  const effective = input.amountInCents ?? toCents(row.amountInCents);
  const payerMemberId = input.payerMemberId ?? row.responsibleMemberId;
  if (
    !(await tx.bankAccount.findFirst({ where: { id: input.accountId, familyId: ctx.familyId } }))
  ) {
    throw invalidRef("accountId", "Escolha a conta do pagamento");
  }
  if (!(await repo.findMember(payerMemberId))) throw invalidRef("payerMemberId", "Membro inválido");

  const created = await createExpenseCore(
    tx,
    ctx,
    {
      type: "EXPENSE",
      accountId: input.accountId,
      categoryId: row.categoryId,
      amountInCents: effective,
      occurredOn: paidOn,
      payerMemberId,
      description: row.description,
      ...((input.note ?? row.note) ? { note: (input.note ?? row.note) as string } : {}),
      isSharedExpense: row.isSharedExpense,
    },
    { allowArchivedCategory: true },
  );
  const res = await repo.markPaid(id, input.version, created.transaction.id, ctx.memberId);
  if (res.count === 0) throw await versionConflict(repo, tx, ctx.familyId, id);

  const balance =
    (await accountBalances(tx, ctx.familyId, [input.accountId])).get(input.accountId) ?? 0;
  return {
    plannedExpense: await loadDTO(tx, ctx, id),
    transaction: { ...created.transaction, plannedExpenseId: id },
    account: { id: input.accountId, balanceInCents: balance },
  };
}

/** SDD-009 §4.4: desfaz a despesa gerada (UNDONE + revisão UNDO) e devolve a previsão a PREVISTO. */
export async function undoPlannedPayment(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ plannedExpense: PlannedExpenseDTO }> {
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await loadForPay(tx, ctx, repo, id, version);
  if (row.status !== "PAGO" || !row.paidTransactionId) {
    throw conflict("PLANNED_NOT_PAID", "Esta despesa prevista não está paga");
  }
  const t = await tx.transaction.findFirst({
    where: { id: row.paidTransactionId, familyId: ctx.familyId },
  });
  if (!t) throw notFound(NOT_FOUND);
  if (!t.deletedAt) {
    const marked = await tx.transaction.updateMany({
      where: { id: t.id, familyId: ctx.familyId, version: t.version, deletedAt: null },
      data: {
        deletedAt: ctx.clock.now(),
        deletedByMemberId: ctx.memberId,
        deletionReason: "UNDONE",
        updatedByMemberId: ctx.memberId,
        version: { increment: 1 },
      },
    });
    if (marked.count === 0) throw await versionConflict(repo, tx, ctx.familyId, id);
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: t.id,
      revision: t.version + 1,
      action: "UNDO",
      actorMemberId: ctx.memberId,
      changes: [{ field: "deletionReason", from: null, to: "UNDONE" }],
    });
  }
  const res = await repo.markUnpaid(id, version, ctx.memberId);
  if (res.count === 0) throw await versionConflict(repo, tx, ctx.familyId, id);
  return { plannedExpense: await loadDTO(tx, ctx, id) };
}
