import { notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import { invoiceStatus, openInvoiceRef } from "@/modules/cartoes/cycle";
import { activePayments } from "@/modules/cartoes/queries";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type { InstallmentParcelDTO, InstallmentPlanDTO } from "@/modules/transacoes/schemas";
import { memberRefOf } from "@/modules/transacoes/service";

/** SDD-014 §4.4: plano + todas as parcelas (inclusive removidas), com a situação de cada fatura HOJE. */
export async function loadInstallmentPlanDTO(
  tx: Tx,
  ctx: RequestContext,
  planId: string,
): Promise<InstallmentPlanDTO> {
  const plan = await tx.installmentPlan.findFirst({
    where: { id: planId, familyId: ctx.familyId },
    include: { card: true, category: true },
  });
  if (!plan) throw notFound("Compra parcelada não encontrada.");
  const parcels = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, installmentPlanId: plan.id },
    include: { invoice: true },
    orderBy: [{ installmentNo: "asc" }],
  });
  const today = todayInFamilyTz(ctx.clock);
  const invoiceIds = [...new Set(parcels.flatMap((p) => (p.invoiceId ? [p.invoiceId] : [])))];
  const payments = await activePayments(tx, ctx.familyId, invoiceIds);
  const openRef = openInvoiceRef(today, plan.card.closingDay);

  const members = new Map<string, MemberRef>(
    (await transacoesRepo(tx, ctx.familyId).listMembers()).map(
      (m) => [m.id, memberRefOf(m)] as const,
    ),
  );
  const ref = (id: string): MemberRef => members.get(id) ?? { id, name: "Membro", image: null };

  const dtos: InstallmentParcelDTO[] = parcels.map((p) => {
    const inv = p.invoice as NonNullable<typeof p.invoice>;
    const { status } = invoiceStatus(
      {
        closingDate: fromDbDate(inv.closingDate),
        dueDate: fromDbDate(inv.dueDate),
        paid: payments.has(inv.id),
      },
      today,
    );
    return {
      transactionId: p.id,
      no: p.installmentNo as number,
      amountInCents: toCents(p.amountInCents),
      occurredOn: fromDbDate(p.occurredOn),
      invoice: {
        ref: inv.referenceMonth,
        closingDate: fromDbDate(inv.closingDate),
        dueDate: fromDbDate(inv.dueDate),
        status,
        isFuture: inv.referenceMonth > openRef,
      },
      state: p.deletedAt ? "REMOVED" : "ACTIVE",
      locked: status !== "OPEN",
      lockedReason:
        status === "PAID" ? "INVOICE_PAID" : status === "CLOSED" ? "INVOICE_CLOSED" : null,
      version: p.version,
    };
  });
  const active = dtos.filter((d) => d.state === "ACTIVE");
  const cardArchived = plan.card.archivedAt !== null || plan.card.deletedAt !== null;
  const deleted = plan.deletedAt !== null;
  const blocked: InstallmentPlanDTO["deleteBlockedReason"] = cardArchived
    ? "CARD_ARCHIVED"
    : active.some((d) => d.lockedReason === "INVOICE_PAID")
      ? "INVOICE_PAID"
      : active.some((d) => d.lockedReason === "INVOICE_CLOSED")
        ? "INVOICE_CLOSED"
        : null;
  return {
    id: plan.id,
    description: plan.description,
    note: plan.note,
    card: { id: plan.card.id, name: plan.card.name },
    category: { id: plan.category.id, name: plan.category.name, icon: plan.category.icon },
    payer: ref(plan.payerMemberId),
    author: ref(plan.authorMemberId),
    count: plan.installmentCount,
    purchaseOn: fromDbDate(plan.purchaseOn),
    totalInCents: toCents(plan.totalInCents),
    currentTotalInCents: active.reduce((s, d) => s + d.amountInCents, 0),
    activeCount: active.length,
    installments: dtos,
    isShared: parcels.some((p) => p.isSharedExpense && !p.deletedAt),
    canDelete: !deleted && blocked === null,
    deleteBlockedReason: deleted ? null : blocked,
    version: plan.version,
    deleted,
    deletedAt: plan.deletedAt ? plan.deletedAt.toISOString() : null,
  };
}
