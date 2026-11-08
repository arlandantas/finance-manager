import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { recordRevision } from "@/modules/contas/ledger";
import { assertImportNotReverted } from "@/modules/importacao/revert-guard";
import { lockFamilySplit } from "@/modules/split/lock";
import {
  cardOf,
  type PlanLock,
  respond as respondPlan,
  versionConflict,
} from "@/modules/transacoes/installment-manage";
import {
  bumpPlan,
  LOCKED_MSG,
  loadParcels,
  openPlan,
  PAID_MSG,
} from "@/modules/transacoes/installment-parcels";
import { requireSettledConfirmation } from "@/modules/transacoes/mutations";
import type { TransactionStateInput } from "@/modules/transacoes/schemas";
import { getTransaction } from "@/modules/transacoes/service";

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
  await assertImportNotReverted(tx, ctx, target.row.importBatchId); // US-069: lote desfeito não volta
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
