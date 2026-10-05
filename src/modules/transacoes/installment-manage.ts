import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { invoiceStatus } from "@/modules/cartoes/cycle";
import { lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { loadInstallmentPlanDTO } from "@/modules/transacoes/installment-plan";
import { memberNames, requireSettledConfirmation } from "@/modules/transacoes/mutations";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  DeleteInstallmentPlanInput,
  InstallmentPlanResponse,
  RestoreInstallmentPlanInput,
} from "@/modules/transacoes/schemas";

const LOCKED = "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas.";
const PLAN_NOT_FOUND = "Compra parcelada não encontrada.";

type PlanLock = {
  id: string;
  cardId: string;
  version: number;
  deletedAt: Date | null;
  updatedByMemberId: string | null;
  authorMemberId: string;
};

/** A PRIMEIRA trava de toda operação de plano (SDD-014 §1: plano ➜ faturas em ordem crescente). */
async function lockPlan(tx: Tx, ctx: RequestContext, id: string): Promise<PlanLock> {
  const rows = await tx.$queryRaw<PlanLock[]>`
    SELECT id, "cardId", version, "deletedAt", "updatedByMemberId", "authorMemberId"
    FROM installment_plans WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid FOR UPDATE`;
  const plan = rows[0];
  if (!plan) throw notFound(PLAN_NOT_FOUND);
  return plan;
}

async function versionConflict(tx: Tx, ctx: RequestContext, plan: PlanLock) {
  const by = plan.updatedByMemberId ?? plan.authorMemberId;
  const name = (await memberNames(transacoesRepo(tx, ctx.familyId))).get(by) ?? "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta compra foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: plan.version, updatedBy: by },
  );
}

async function cardOf(tx: Tx, ctx: RequestContext, cardId: string) {
  const card = await tx.creditCard.findFirst({ where: { id: cardId, familyId: ctx.familyId } });
  if (!card) throw notFound(PLAN_NOT_FOUND);
  return card;
}

async function respond(
  tx: Tx,
  ctx: RequestContext,
  planId: string,
  cardId: string,
): Promise<InstallmentPlanResponse> {
  const card = await cardOf(tx, ctx, cardId);
  const used = (await cardUsage(tx, ctx.familyId, [cardId])).get(cardId) ?? 0;
  return {
    plan: await loadInstallmentPlanDTO(tx, ctx, planId),
    card: { id: cardId, usedInCents: used, availableInCents: toCents(card.limitInCents) - used },
  };
}

/** US-040b (SDD-014 §4.3): exclui a compra inteira, só se TODA parcela ativa está em fatura aberta. */
export async function deleteInstallmentPlan(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: DeleteInstallmentPlanInput,
): Promise<InstallmentPlanResponse> {
  const plan = await lockPlan(tx, ctx, id);
  if (plan.deletedAt) throw conflict("ALREADY_DELETED", "Esta compra já foi excluída.");
  if (plan.version !== input.version) throw await versionConflict(tx, ctx, plan);

  const parcels = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, installmentPlanId: id, deletedAt: null },
    include: { invoice: true },
    orderBy: { installmentNo: "asc" },
  });
  const invoiceIds = parcels.flatMap((p) => (p.invoiceId ? [p.invoiceId] : []));
  await lockInvoices(tx, ctx.familyId, invoiceIds);
  const today = todayInFamilyTz(ctx.clock);
  const payments = await activePayments(tx, ctx.familyId, invoiceIds);
  for (const p of parcels) {
    const inv = p.invoice as NonNullable<typeof p.invoice>;
    const { status } = invoiceStatus(
      {
        closingDate: fromDbDate(inv.closingDate),
        dueDate: fromDbDate(inv.dueDate),
        paid: payments.has(inv.id),
      },
      today,
    );
    if (status !== "OPEN") throw unprocessable("INSTALLMENT_PLAN_LOCKED", LOCKED);
  }
  // mês acertado: só parcelas comuns (com rateio) importam; período = o da COMPETÊNCIA de cada parcela
  const shared = parcels.filter((p) => p.isSharedExpense);
  if (shared.length > 0) {
    await requireSettledConfirmation(
      tx,
      ctx,
      shared.map((p) => fromDbDate(p.competenceOn)),
      input.confirmSettledPeriod,
    );
  }

  const at = ctx.clock.now(); // o MESMO instante em todas as linhas (carimbo, ADR-020 §3)
  await tx.transaction.updateMany({
    where: { familyId: ctx.familyId, installmentPlanId: id, deletedAt: null },
    data: {
      deletedAt: at,
      deletedByMemberId: ctx.memberId,
      deletionReason: "DELETED",
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  await tx.installmentPlan.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      deletedAt: at,
      deletedByMemberId: ctx.memberId,
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  for (const p of parcels) {
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: p.id,
      revision: p.version + 1,
      action: "DELETE",
      actorMemberId: ctx.memberId,
      changes: [
        { field: "installmentPlan", from: "ACTIVE", to: "DELETED" },
        { field: "deletionReason", from: null, to: "DELETED" },
      ] satisfies Change[],
    });
  }
  return respond(tx, ctx, id, plan.cardId);
}

/** O "Desfazer": devolve só as parcelas removidas por AQUELA exclusão (carimbo único, ADR-020 §3). */
export async function restoreInstallmentPlan(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: RestoreInstallmentPlanInput,
): Promise<InstallmentPlanResponse> {
  const plan = await lockPlan(tx, ctx, id);
  if (!plan.deletedAt) {
    throw unprocessable("NOT_RESTORABLE", "Esta compra não pode ser restaurada.");
  }
  if (plan.version !== input.version) throw await versionConflict(tx, ctx, plan);
  const card = await cardOf(tx, ctx, plan.cardId);
  if (card.archivedAt !== null || card.deletedAt !== null) {
    throw unprocessable("INVALID_REFERENCE", "Escolha um cartão", [
      { path: "cardId", message: "Escolha um cartão" },
    ]);
  }

  const parcels = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, installmentPlanId: id, deletedAt: plan.deletedAt },
    orderBy: { installmentNo: "asc" },
  });
  const invoiceIds = parcels.flatMap((p) => (p.invoiceId ? [p.invoiceId] : []));
  await lockInvoices(tx, ctx.familyId, invoiceIds);
  if ((await activePayments(tx, ctx.familyId, invoiceIds)).size > 0) {
    throw unprocessable(
      "INVOICE_PAID_LOCKED",
      "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.",
    );
  }
  const shared = parcels.filter((p) => p.isSharedExpense);
  if (shared.length > 0) {
    await requireSettledConfirmation(
      tx,
      ctx,
      shared.map((p) => fromDbDate(p.competenceOn)),
      input.confirmSettledPeriod,
    );
  }

  await tx.transaction.updateMany({
    where: { familyId: ctx.familyId, installmentPlanId: id, deletedAt: plan.deletedAt },
    data: {
      deletedAt: null,
      deletedByMemberId: null,
      deletionReason: null,
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  await tx.installmentPlan.updateMany({
    where: { id, familyId: ctx.familyId },
    data: {
      deletedAt: null,
      deletedByMemberId: null,
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  for (const p of parcels) {
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: p.id,
      revision: p.version + 1,
      action: "RESTORE",
      actorMemberId: ctx.memberId,
      changes: [
        { field: "installmentPlan", from: "DELETED", to: "ACTIVE" },
        { field: "deletionReason", from: "DELETED", to: null },
      ] satisfies Change[],
    });
  }
  return respond(tx, ctx, id, plan.cardId);
}
