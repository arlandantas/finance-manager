import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { type InvoiceStatus, invoiceStatus } from "@/modules/cartoes/cycle";
import { lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { lockFamilySplit } from "@/modules/split/lock";
import { rewriteSplitAmounts } from "@/modules/split/write";
import {
  assertCanWriteParcels,
  cardOf,
  lockPlan,
  type PlanLock,
  respond as respondPlan,
  versionConflict,
} from "@/modules/transacoes/installment-manage";
import { loadInstallmentPlanDTO } from "@/modules/transacoes/installment-plan";
import type {
  EditInstallmentParsed,
  EditInstallmentResponse,
} from "@/modules/transacoes/installment-schemas";
import { requireSettledConfirmation } from "@/modules/transacoes/mutations";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type { TransactionDetailDTO, TransactionStateInput } from "@/modules/transacoes/schemas";
import { getTransaction } from "@/modules/transacoes/service";

const LOCKED_MSG: Record<Exclude<InvoiceStatus, "OPEN">, string> = {
  PAID: "Esta parcela está em uma fatura já paga.",
  CLOSED: "Esta parcela está em uma fatura fechada.",
};
const PAID_MSG =
  "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.";

/** Parcela com o status da fatura de HOJE (pago/fechado/aberto). */
async function loadParcels(tx: Tx, ctx: RequestContext, plan: PlanLock) {
  const parcels = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, installmentPlanId: plan.id },
    include: { invoice: true },
    orderBy: { installmentNo: "asc" },
  });
  await assertCanWriteParcels(
    tx,
    ctx,
    parcels.filter((p) => !p.deletedAt),
  ); // SEC-021 / D-GES-50
  const invoiceIds = parcels.flatMap((p) => (p.invoiceId ? [p.invoiceId] : []));
  await lockInvoices(tx, ctx.familyId, invoiceIds); // ordem crescente de `ref`
  const payments = await activePayments(tx, ctx.familyId, invoiceIds);
  const today = todayInFamilyTz(ctx.clock);
  return parcels.map((p) => {
    const inv = p.invoice as NonNullable<typeof p.invoice>;
    const { status } = invoiceStatus(
      {
        closingDate: fromDbDate(inv.closingDate),
        dueDate: fromDbDate(inv.dueDate),
        paid: payments.has(inv.id),
      },
      today,
    );
    return { row: p, status };
  });
}
type Parcel = Awaited<ReturnType<typeof loadParcels>>[number];

/** O plano é a PRIMEIRA trava (depois da família); devolve plano e a parcela-alvo. */
async function openPlan(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  versions: { planVersion?: number | undefined },
) {
  const found = await tx.transaction.findFirst({
    where: { id, familyId: ctx.familyId },
    select: { installmentPlanId: true },
  });
  if (!found?.installmentPlanId) throw notFound("Lançamento não encontrado.");
  const plan = await lockPlan(tx, ctx, found.installmentPlanId);
  if (versions.planVersion !== undefined && plan.version !== versions.planVersion) {
    throw await versionConflict(tx, ctx, plan);
  }
  return plan;
}

async function respondEdit(
  tx: Tx,
  ctx: RequestContext,
  plan: PlanLock,
  changedIds: string[],
): Promise<EditInstallmentResponse> {
  const transactions: TransactionDetailDTO[] = [];
  for (const id of changedIds) transactions.push((await getTransaction(tx, ctx, id)).transaction);
  const card = await cardOf(tx, ctx, plan.cardId);
  const used = (await cardUsage(tx, ctx.familyId, [plan.cardId])).get(plan.cardId) ?? 0;
  return {
    transactions,
    plan: await loadInstallmentPlanDTO(tx, ctx, plan.id),
    card: {
      id: plan.cardId,
      usedInCents: used,
      availableInCents: toCents(card.limitInCents) - used,
    },
  };
}

const bumpPlan = (tx: Tx, ctx: RequestContext, planId: string) =>
  tx.installmentPlan.updateMany({
    where: { id: planId, familyId: ctx.familyId },
    data: { updatedByMemberId: ctx.memberId, version: { increment: 1 } },
  });

/** PATCH /transactions/:id em parcela (US-041): "Somente esta" ou "Esta e as próximas". */
export async function editInstallment(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: EditInstallmentParsed,
): Promise<EditInstallmentResponse> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const plan = await openPlan(tx, ctx, id, { planVersion: input.planVersion });
  if (plan.deletedAt) throw unprocessable("TRANSACTION_DELETED", "Esta compra foi excluída.");
  const parcels = (await loadParcels(tx, ctx, plan)).filter((p) => !p.row.deletedAt);
  const target = parcels.find((p) => p.row.id === id);
  if (!target) {
    throw unprocessable("TRANSACTION_DELETED", "Esta parcela foi excluída. Restaure para editar.");
  }
  if (target.row.version !== input.version) throw await versionConflict(tx, ctx, plan);
  if (target.status !== "OPEN") {
    throw unprocessable("INSTALLMENT_LOCKED", LOCKED_MSG[target.status]);
  }

  const repo = transacoesRepo(tx, ctx.familyId);
  if (input.categoryId !== undefined && input.categoryId !== target.row.categoryId) {
    const category = await repo.findCategory(input.categoryId);
    if (!category) {
      throw unprocessable("INVALID_REFERENCE", "Escolha uma categoria", [
        { path: "categoryId", message: "Escolha uma categoria" },
      ]);
    }
    if (category.kind !== "EXPENSE") {
      throw unprocessable(
        "CATEGORY_KIND_MISMATCH",
        "A categoria não combina com o tipo do lançamento",
        [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
      );
    }
  }

  // `THIS_AND_NEXT`: as seguintes em fatura fechada/paga são puladas (US-041)
  const selected: Parcel[] =
    input.scope === "ONLY_THIS"
      ? [target]
      : parcels.filter((p) => (p.row.installmentNo ?? 0) >= (target.row.installmentNo ?? 0));
  const targets = selected.filter((p) => p.status === "OPEN");

  const diffs = targets.flatMap((p) => {
    const before = {
      amountInCents: toCents(p.row.amountInCents),
      categoryId: p.row.categoryId,
      description: p.row.description,
      note: p.row.note,
    };
    const wanted: Partial<typeof before> = {};
    if (input.amountInCents !== undefined && input.amountInCents !== before.amountInCents) {
      wanted.amountInCents = input.amountInCents;
    }
    if (input.categoryId !== undefined && input.categoryId !== before.categoryId) {
      wanted.categoryId = input.categoryId;
    }
    if (input.description !== undefined && input.description !== before.description) {
      wanted.description = input.description;
    }
    if (input.note !== undefined && input.note !== before.note) wanted.note = input.note;
    const keys = Object.keys(wanted) as Array<keyof typeof before>;
    return keys.length === 0 ? [] : [{ parcel: p, before, wanted, keys }];
  });
  if (diffs.length === 0) return respondEdit(tx, ctx, plan, []);

  // mês acertado: só parcela dividida importa (o período é o da COMPETÊNCIA)
  const sharedMoney = diffs.filter((d) => d.parcel.row.isSharedExpense && d.wanted.amountInCents);
  if (sharedMoney.length > 0) {
    await requireSettledConfirmation(
      tx,
      ctx,
      sharedMoney.map((d) => fromDbDate(d.parcel.row.competenceOn)),
      input.confirmSettledPeriod,
    );
  }

  for (const d of diffs) {
    const { row } = d.parcel;
    const res = await tx.transaction.updateMany({
      where: { id: row.id, familyId: ctx.familyId, version: row.version, deletedAt: null },
      data: { ...d.wanted, updatedByMemberId: ctx.memberId, version: { increment: 1 } },
    });
    if (res.count === 0) throw await versionConflict(tx, ctx, plan);
    if (row.isSharedExpense && row.payerMemberId && d.wanted.amountInCents !== undefined) {
      await rewriteSplitAmounts(tx, ctx.familyId, {
        transactionId: row.id,
        amountInCents: d.wanted.amountInCents,
        payerMemberId: row.payerMemberId,
      }); // mesmos `bps`, novos centavos
    }
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: row.id,
      revision: row.version + 1,
      action: "UPDATE",
      actorMemberId: ctx.memberId,
      changes: d.keys.map((field) => ({
        field,
        from: d.before[field],
        to: d.wanted[field],
      })) satisfies Change[],
    });
  }
  await bumpPlan(tx, ctx, plan.id);
  return respondEdit(
    tx,
    ctx,
    plan,
    diffs.map((d) => d.parcel.row.id),
  );
}

/** POST /transactions/:id/delete em parcela: só em fatura aberta; some do total e do limite. */
export async function deleteInstallment(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: TransactionStateInput,
) {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const plan = await openPlan(tx, ctx, id, { planVersion: input.planVersion });
  if (plan.deletedAt) throw conflict("ALREADY_DELETED", "Esta compra já foi excluída.");
  const parcels = await loadParcels(tx, ctx, plan);
  const target = parcels.find((p) => p.row.id === id);
  if (!target) throw notFound("Lançamento não encontrado.");
  if (target.row.deletedAt) throw conflict("ALREADY_DELETED", "Esta parcela já foi excluída.");
  if (target.row.version !== input.version) throw await versionConflict(tx, ctx, plan);
  if (target.status !== "OPEN")
    throw unprocessable("INSTALLMENT_LOCKED", LOCKED_MSG[target.status]);
  if (target.row.isSharedExpense) {
    await requireSettledConfirmation(
      tx,
      ctx,
      [fromDbDate(target.row.competenceOn)],
      input.confirmSettledPeriod,
    );
  }
  const res = await tx.transaction.updateMany({
    where: { id, familyId: ctx.familyId, version: target.row.version, deletedAt: null },
    data: {
      deletedAt: ctx.clock.now(),
      deletedByMemberId: ctx.memberId,
      deletionReason: "DELETED",
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) throw await versionConflict(tx, ctx, plan);
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: id,
    revision: target.row.version + 1,
    action: "DELETE",
    actorMemberId: ctx.memberId,
    changes: [{ field: "deletionReason", from: null, to: "DELETED" }],
  });
  await bumpPlan(tx, ctx, plan.id);
  return withTail(tx, ctx, plan, id);
}

/** POST /transactions/:id/restore em parcela: exige fatura sem pagamento. */
export async function restoreInstallment(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: TransactionStateInput,
) {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const plan = await openPlan(tx, ctx, id, { planVersion: input.planVersion });
  if (plan.deletedAt) {
    throw unprocessable("NOT_RESTORABLE", "Restaure a compra inteira pelo Desfazer da compra.");
  }
  const parcels = await loadParcels(tx, ctx, plan);
  const target = parcels.find((p) => p.row.id === id);
  if (!target) throw notFound("Lançamento não encontrado.");
  if (!target.row.deletedAt || target.row.deletionReason !== "DELETED") {
    throw unprocessable("NOT_RESTORABLE", "Este lançamento não pode ser restaurado.");
  }
  if (target.row.version !== input.version) throw await versionConflict(tx, ctx, plan);
  const card = await cardOf(tx, ctx, plan.cardId);
  if (card.archivedAt !== null || card.deletedAt !== null) {
    throw unprocessable("INVALID_REFERENCE", "Escolha um cartão", [
      { path: "cardId", message: "Escolha um cartão" },
    ]);
  }
  if (target.status === "PAID") throw unprocessable("INVOICE_PAID_LOCKED", PAID_MSG);
  if (target.row.isSharedExpense) {
    await requireSettledConfirmation(
      tx,
      ctx,
      [fromDbDate(target.row.competenceOn)],
      input.confirmSettledPeriod,
    );
  }
  const res = await tx.transaction.updateMany({
    where: { id, familyId: ctx.familyId, version: target.row.version, deletedAt: { not: null } },
    data: {
      deletedAt: null,
      deletedByMemberId: null,
      deletionReason: null,
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  if (res.count === 0) throw await versionConflict(tx, ctx, plan);
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: id,
    revision: target.row.version + 1,
    action: "RESTORE",
    actorMemberId: ctx.memberId,
    changes: [{ field: "deletionReason", from: "DELETED", to: null }],
  });
  await bumpPlan(tx, ctx, plan.id);
  return withTail(tx, ctx, plan, id);
}

async function withTail(tx: Tx, ctx: RequestContext, plan: PlanLock, id: string) {
  const { plan: dto, card } = await respondPlan(tx, ctx, plan.id, plan.cardId);
  return { transaction: (await getTransaction(tx, ctx, id)).transaction, plan: dto, card };
}

/** O PATCH/delete/restore em parcela vão para cá (as demais rotas seguem o caminho comum). */
export async function isInstallmentParcel(tx: Tx, ctx: RequestContext, id: string) {
  const row = await tx.transaction.findFirst({
    where: { id, familyId: ctx.familyId },
    select: { installmentPlanId: true },
  });
  return Boolean(row?.installmentPlanId);
}
