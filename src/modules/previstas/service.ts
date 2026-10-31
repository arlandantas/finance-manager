import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { shareLockAccounts } from "@/modules/contas/lock";
import { toMemberRef } from "@/modules/familia/display-name";
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
import { lockFamilySplit } from "@/modules/split/lock";
import {
  adminFullPower,
  assertCanWritePlanned,
  assertCanWriteTransaction,
  assertPersonalForSelf,
  assertPlannedControllerLimits,
  assertPlannedNoCapture,
  assertPlannedResultAllowed,
  assertPlannedUnlinkedPayer,
  GONE_PAYER_BAIXA_MESSAGE,
  isActiveUnlinked,
  memberRefsWithReturn,
  type OwnerStanding,
  ownerStanding,
  PERSONAL_ON_BEHALF_CODE,
  PERSONAL_ON_BEHALF_MESSAGE,
  PERSONAL_OWNER_ONLY_CODE,
  PERSONAL_STRUCTURE_MESSAGE,
  UNLINKED_PAYER_CODE,
  UNLINKED_PAYER_SELF_MESSAGE,
} from "@/modules/transacoes/ownership";
import { createExpenseCore } from "@/modules/transacoes/service";

type Repo = ReturnType<typeof previstasRepo>;
export type PlannedRow = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;
type MemberRow = Awaited<ReturnType<Repo["listMembers"]>>[number];

const NOT_FOUND = "Despesa prevista não encontrada.";

export const memberRefOf = (m: MemberRow): MemberRef => toMemberRef(m);

export async function memberMap(repo: Repo): Promise<Map<string, MemberRef>> {
  return memberRefsWithReturn(await repo.listMembers(), memberRefOf);
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
    series: row.series ? { id: row.series.id, dayOfMonth: row.series.dayOfMonth } : null,
    isException: row.isException,
    occurrenceMonth: row.occurrenceMonth ? fromDbDate(row.occurrenceMonth).slice(0, 7) : null,
    paymentAccount: row.paymentAccount
      ? {
          id: row.paymentAccount.id,
          name: row.paymentAccount.name,
          archived: row.paymentAccount.archivedAt !== null,
          ownerId: row.paymentAccount.ownerMemberId,
        }
      : null,
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
            authorId: paidTx.authorMemberId,
            accountOwnerId: paidTx.account?.ownerMemberId ?? null,
          }
        : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

export async function checkPaymentAccount(repo: Repo, accountId: string) {
  if (!(await repo.findActiveAccount(accountId))) {
    throw invalidRef("paymentAccountId", "Escolha uma conta ativa");
  }
}

export async function checkCategory(repo: Repo, categoryId: string) {
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
  await assertPlannedResultAllowed(tx, ctx, {
    isSharedExpense: input.isSharedExpense,
    responsibleMemberId,
  }); // SEC-026; US-093b: exceção do Administrador para dono sem conta
  await checkCategory(repo, input.categoryId);
  if (!(await repo.findMember(responsibleMemberId))) {
    throw invalidRef("responsibleMemberId", "Responsável inválido");
  }
  if (input.paymentAccountId) await checkPaymentAccount(repo, input.paymentAccountId);
  const row = await repo.insert({
    paymentAccountId: input.paymentAccountId ?? null,
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
  // SDD-034 R2: contas (atual e nova) ANTES de qualquer leitura do dono (conta ➔ membro, como o removal.ts)
  await shareLockAccounts(tx, ctx.familyId, [row.paymentAccountId, input.paymentAccountId]);
  await assertCanWritePlanned(tx, ctx, row); // SEC-026a: "Só meu" é só do responsável
  // SEC-043/044: quem só controla não muda divisão, responsável nem conta; D-GES-55: Admin sobre ex-membro pode
  const standing = await ownerStanding(tx, ctx, row.responsibleMemberId, [
    row.paymentAccountId,
    input.paymentAccountId,
  ]); // SEC-049
  // US-093b (SEC-059a): responsável para/de sem conta só pelo lançador ou Administrador (antes da captura)
  assertPlannedUnlinkedPayer(ctx, row, input.responsibleMemberId, {
    currentUnlinked: standing.ownerUnlinked,
    nextUnlinked: await isActiveUnlinked(tx, ctx, input.responsibleMemberId),
  });
  assertPlannedNoCapture(ctx, row, input); // SEC-038: ninguém "captura" a prevista dividida de outro
  // SEC-051 (D-GES-59): responsável ex-membro sem retorno é imutável (dividida ou "Só meu"); poder pleno só no "Só meu"
  const fullPower = adminFullPower(ctx, standing) && !row.isSharedExpense;
  assertPlannedControllerLimits(ctx, row, input, {
    fullPower,
    ownerIsActor: standing.ownerIsActor && !row.isSharedExpense,
    payerGone: standing.ownerRemoved,
  });
  await assertPlannedResultAllowed(
    tx,
    ctx,
    {
      isSharedExpense: input.isSharedExpense ?? row.isSharedExpense,
      responsibleMemberId: input.responsibleMemberId ?? row.responsibleMemberId,
    },
    row,
  );
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
  if (
    input.paymentAccountId &&
    input.paymentAccountId !== row.paymentAccountId &&
    !(await repo.findActiveAccount(input.paymentAccountId))
  ) {
    throw invalidRef("paymentAccountId", "Escolha uma conta ativa");
  }
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
    ...(input.paymentAccountId !== undefined && input.paymentAccountId !== row.paymentAccountId
      ? { paymentAccountId: input.paymentAccountId }
      : {}),
  };
  if (Object.keys(wanted).length === 0) return { plannedExpense: await loadDTO(tx, ctx, id) };
  // SDD-019 §3.3: mudar uma ocorrência de série (exceto a observação) a torna "alterada".
  const makesException =
    row.seriesId !== null && Object.keys(wanted).some((k) => k !== "note") && !row.isException;
  const res = await repo.updateVersioned(id, input.version, {
    ...wanted,
    ...(makesException ? { isException: true } : {}),
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
  const row = await loadForChange(tx, ctx, repo, id, version);
  await assertCanWritePlanned(tx, ctx, row); // SEC-026a
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
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava (a baixa cria despesa comum)
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await loadForPay(tx, ctx, repo, id, input.version);
  if (row.status === "PAGO") {
    throw conflict("PLANNED_ALREADY_PAID", "Esta despesa prevista já foi paga");
  }
  await shareLockAccounts(tx, ctx.familyId, [row.paymentAccountId, input.accountId]); // SDD-034 R2
  await assertCanWritePlanned(tx, ctx, row); // SEC-026b: dar baixa num "Só meu" é só do responsável
  const today = todayInFamilyTz(ctx.clock);
  const paidOn = input.paidOn ?? today;
  if (compareDate(paidOn, today) > 0) {
    const message = "A data do pagamento não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "paidOn", message }]);
  }
  const effective = input.amountInCents ?? toCents(row.amountInCents);
  const standing = await ownerStanding(tx, ctx, row.responsibleMemberId, [
    row.paymentAccountId,
    input.accountId,
  ]); // SEC-049
  const personalStanding: OwnerStanding = row.isSharedExpense
    ? { ownerIsActor: false, ownerRemoved: false, ownerUnlinked: false }
    : standing;
  // quem voltou à família paga em nome do vínculo atual (o antigo, removido, não é pagador válido)
  const ownerId = personalStanding.ownerIsActor ? ctx.memberId : row.responsibleMemberId;
  // D-GES-59 (DEV-135): responsável ex-membro sem retorno é imutável; a baixa é um pagamento NOVO e real, e quem
  // a realiza é o pagador (o ex-membro não pode pagar). Informar outro pagador ⇒ 403.
  const responsibleGone = standing.ownerRemoved;
  const payerMemberId = input.payerMemberId ?? (responsibleGone ? ctx.memberId : ownerId);
  if (responsibleGone && payerMemberId !== ctx.memberId) {
    throw forbidden(GONE_PAYER_BAIXA_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  if (
    !(await tx.bankAccount.findFirst({ where: { id: input.accountId, familyId: ctx.familyId } }))
  ) {
    throw invalidRef("accountId", "Escolha a conta do pagamento");
  }
  if (!(await repo.findMember(payerMemberId))) throw invalidRef("payerMemberId", "Membro inválido");
  // US-093b (D-034-2/D-034-4, I-1; SDD-034 §4.2): a baixa do "Só meu" de dono sem conta mantém o pagador original;
  // o tutor não assume o pagamento (para si) nem o entrega a outro.
  if (!row.isSharedExpense && personalStanding.ownerUnlinked && payerMemberId !== ownerId) {
    throw payerMemberId === ctx.memberId
      ? forbidden(UNLINKED_PAYER_SELF_MESSAGE, UNLINKED_PAYER_CODE)
      : forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
  // SEC-044d: quem só controla (não é o responsável) só dá baixa com conta do responsável ou a sua
  const fullPower = adminFullPower(ctx, personalStanding); // D-GES-55; US-093b: tutor do dono sem conta
  if (!row.isSharedExpense && ownerId !== ctx.memberId && !fullPower) {
    const acc = await tx.bankAccount.findFirst({
      where: { id: input.accountId, familyId: ctx.familyId },
      select: { ownerMemberId: true },
    });
    if (
      acc &&
      acc.ownerMemberId !== row.responsibleMemberId &&
      acc.ownerMemberId !== ctx.memberId
    ) {
      throw forbidden(PERSONAL_STRUCTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
    }
  }
  // D-GES-50: a baixa materializa um "Só meu" que já existe; quem controla (dono da conta, lançador) dá a baixa
  // sem virar o pagador, mas ninguém entrega a baixa em nome de um terceiro.
  if (!row.isSharedExpense && payerMemberId !== ownerId) {
    // SEC-043: quem só controla não assume o pagamento (a baixa mantém o pagador original)
    if (ownerId !== ctx.memberId && !fullPower) {
      throw forbidden(PERSONAL_STRUCTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
    }
    await assertPersonalForSelf(tx, ctx, { isSharedExpense: false, payerMemberId });
  }

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
      installments: 1,
      paidBeforeApp: 0,
    },
    { allowArchivedCategory: true, personalFromPlanned: true },
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
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2
  const repo = previstasRepo(tx, ctx.familyId);
  const row = await loadForPay(tx, ctx, repo, id, version);
  if (row.status !== "PAGO" || !row.paidTransactionId) {
    throw conflict("PLANNED_NOT_PAID", "Esta despesa prevista não está paga");
  }
  const t = await tx.transaction.findFirst({
    where: { id: row.paidTransactionId, familyId: ctx.familyId },
  });
  if (!t) throw notFound(NOT_FOUND);
  await assertCanWritePlanned(tx, ctx, row); // SEC-044d: o estorno checa também o controle da prevista
  await assertCanWriteTransaction(tx, ctx, t); // SEC-021: estornar a baixa de um "Só meu" é só do dono
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
