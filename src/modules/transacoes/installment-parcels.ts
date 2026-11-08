import { notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { type InvoiceStatus, invoiceStatus } from "@/modules/cartoes/cycle";
import { lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments } from "@/modules/cartoes/queries";
import {
  assertCanWriteParcels,
  lockPlan,
  type PlanLock,
  versionConflict,
} from "@/modules/transacoes/installment-manage";

export const LOCKED_MSG: Record<Exclude<InvoiceStatus, "OPEN">, string> = {
  PAID: "Esta parcela está em uma fatura já paga.",
  CLOSED: "Esta parcela está em uma fatura fechada.",
};
export const PAID_MSG =
  "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la.";

/** Parcela com o status da fatura de HOJE (pago/fechado/aberto). */
export async function loadParcels(tx: Tx, ctx: RequestContext, plan: PlanLock) {
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
export type Parcel = Awaited<ReturnType<typeof loadParcels>>[number];

/** O plano é a PRIMEIRA trava (depois da família); devolve plano e a parcela-alvo. */
export async function openPlan(
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

export const bumpPlan = (tx: Tx, ctx: RequestContext, planId: string) =>
  tx.installmentPlan.updateMany({
    where: { id: planId, familyId: ctx.familyId },
    data: { updatedByMemberId: ctx.memberId, version: { increment: 1 } },
  });

/** O PATCH/delete/restore em parcela vão para cá (as demais rotas seguem o caminho comum). */
export async function isInstallmentParcel(tx: Tx, ctx: RequestContext, id: string) {
  const row = await tx.transaction.findFirst({
    where: { id, familyId: ctx.familyId },
    select: { installmentPlanId: true },
  });
  return Boolean(row?.installmentPlanId);
}
