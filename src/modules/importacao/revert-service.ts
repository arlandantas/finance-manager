import { Prisma } from "@/generated/prisma/client";
import { ApiError, conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { lockInvoices } from "@/modules/cartoes/invoices";
import { activePayments, cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { lockFamilySplit } from "@/modules/split/lock";
import { assertCanWriteParcels } from "@/modules/transacoes/installment-manage";
import { requireSettledConfirmation } from "@/modules/transacoes/mutations";
import { type ImportBatchDTO, toBatchDTOs } from "./batches";
import type { RevertImportBody } from "./revert-schema";

const NOT_FOUND = "Importação não encontrada.";

type Locked = { id: string; cardId: string; version: number; revertedAt: Date | null };

/** Trava o lote e, em seguida, os planos (ordem do projeto: plano ➜ faturas por `ref` crescente). */
async function lockBatch(tx: Tx, ctx: RequestContext, id: string): Promise<Locked> {
  const rows = await tx.$queryRaw<Locked[]>`
    SELECT id, "cardId", version, "revertedAt" FROM import_batches
    WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid FOR UPDATE`;
  if (!rows[0]) throw notFound(NOT_FOUND);
  return rows[0];
}

async function lockPlans(tx: Tx, ctx: RequestContext, batchId: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM installment_plans
    WHERE "importBatchId" = ${batchId}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "deletedAt" IS NULL
    ORDER BY id ASC FOR UPDATE`);
}

async function respond(tx: Tx, ctx: RequestContext, batchId: string, cardId: string) {
  const row = await tx.importBatch.findFirstOrThrow({
    where: { id: batchId, familyId: ctx.familyId },
    include: { invoice: { select: { referenceMonth: true } } },
  });
  const card = await tx.creditCard.findFirstOrThrow({
    where: { id: cardId, familyId: ctx.familyId },
  });
  const used = (await cardUsage(tx, ctx.familyId, [cardId])).get(cardId) ?? 0;
  const [batch] = (await toBatchDTOs(tx, ctx, [row])) as [ImportBatchDTO];
  return {
    batch,
    card: { id: cardId, usedInCents: used, availableInCents: toCents(card.limitInCents) - used },
  };
}

/**
 * US-069 (ADR-042 §11, spec 13 regra 18): desfaz o lote inteiro numa transação. Ordem das travas:
 * família (rateio) ➜ lote ➜ planos ➜ faturas por `ref` crescente. Repetir = sem efeito.
 */
export async function revertImportBatch(
  tx: Tx,
  ctx: RequestContext,
  batchId: string,
  input: RevertImportBody,
) {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const batch = await lockBatch(tx, ctx, batchId);
  if (batch.revertedAt) return respond(tx, ctx, batchId, batch.cardId); // idempotente: 200, sem efeito
  if (batch.version !== input.version) {
    throw conflict("VERSION_CONFLICT", "Esta importação foi alterada. Recarregue para continuar.", {
      currentVersion: batch.version,
    });
  }
  await lockPlans(tx, ctx, batchId);
  const invoiceRows = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, importBatchId: batchId, deletedAt: null },
    select: { invoiceId: true },
  });
  const invoiceIds = invoiceRows.flatMap((r) => (r.invoiceId ? [r.invoiceId] : []));
  await lockInvoices(tx, ctx.familyId, invoiceIds);
  // relido sob as travas: nenhuma edição concorrente escapa
  const items = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, importBatchId: batchId, deletedAt: null },
    include: { invoice: true },
    orderBy: [{ occurredOn: "asc" }, { id: "asc" }],
  });
  const payments = await activePayments(tx, ctx.familyId, invoiceIds);
  const lockedRow = items.find((i) => i.invoiceId && payments.has(i.invoiceId));
  if (lockedRow) {
    throw unprocessable(
      "INVOICE_PAID_LOCKED",
      "Uma fatura deste lote já foi paga. Desfaça o pagamento da fatura para desfazer a importação.",
      { ref: lockedRow.invoice?.referenceMonth ?? null },
    );
  }
  try {
    await assertCanWriteParcels(tx, ctx, items);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      throw forbidden(
        "Há itens “Só meu” de outra pessoa nesta importação. Só quem controla todos eles pode desfazê-la.",
        "IMPORT_REVERT_FORBIDDEN",
      );
    }
    throw e;
  }
  const edited = items.filter((i) => i.version > 1);
  if (edited.length > 0 && !input.confirmEditedItems) {
    throw conflict("IMPORT_EDITED_ITEMS", "Alguns itens foram editados depois da importação.", {
      items: edited.map((i) => ({
        id: i.id,
        description: i.description,
        date: fromDbDate(i.occurredOn),
      })),
    });
  }
  const shared = items.filter((i) => i.isSharedExpense);
  if (shared.length > 0) {
    await requireSettledConfirmation(
      tx,
      ctx,
      shared.map((i) => fromDbDate(i.competenceOn)),
      input.confirmSettledPeriod,
    );
  }

  const at = ctx.clock.now(); // o MESMO instante: `revertedAt` = `deletedAt` de todas as linhas
  await tx.transaction.updateMany({
    where: { familyId: ctx.familyId, importBatchId: batchId, deletedAt: null },
    data: {
      deletedAt: at,
      deletedByMemberId: ctx.memberId,
      deletionReason: "DELETED",
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  await tx.installmentPlan.updateMany({
    where: { familyId: ctx.familyId, importBatchId: batchId, deletedAt: null },
    data: {
      deletedAt: at,
      deletedByMemberId: ctx.memberId,
      updatedByMemberId: ctx.memberId,
      version: { increment: 1 },
    },
  });
  await tx.transactionRevision.createMany({
    data: items.map((i) => ({
      familyId: ctx.familyId,
      transactionId: i.id,
      revision: i.version + 1,
      action: "DELETE" as const,
      actorMemberId: ctx.memberId,
      changes: [
        { field: "importBatch", from: "ACTIVE", to: "REVERTED" },
        { field: "deletionReason", from: null, to: "DELETED" },
      ] satisfies Change[] as unknown as Prisma.InputJsonValue,
    })),
  });
  await tx.importBatch.update({
    where: { familyId_id: { familyId: ctx.familyId, id: batchId } },
    data: { revertedAt: at, revertedByMemberId: ctx.memberId, version: { increment: 1 } },
  });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "INVOICE_IMPORT_REVERTED",
      actorMemberId: ctx.memberId,
      // só ids e contagem: nunca descrições (invariante 1)
      changes: { batchId, cardId: batch.cardId, itemCount: items.length },
    },
  });
  return respond(tx, ctx, batchId, batch.cardId);
}
