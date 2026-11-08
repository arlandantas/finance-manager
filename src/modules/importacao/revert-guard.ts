import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

/**
 * US-069 (AC7): item ou plano de lote revertido não volta pelo "Desfazer"/restaurar; só reimportando o arquivo.
 * Chamar depois de a trava do lançamento/plano ser tomada (a reversão trava o lote antes de tudo).
 */
export async function assertImportNotReverted(
  tx: Tx,
  ctx: RequestContext,
  importBatchId: string | null | undefined,
): Promise<void> {
  if (!importBatchId) return;
  const batch = await tx.importBatch.findFirst({
    where: { id: importBatchId, familyId: ctx.familyId, revertedAt: { not: null } },
    select: { id: true },
  });
  if (batch) {
    throw unprocessable(
      "NOT_RESTORABLE",
      "Esta importação foi desfeita. Para recuperar os itens, importe o arquivo de novo.",
    );
  }
}

export async function assertPlanImportNotReverted(
  tx: Tx,
  ctx: RequestContext,
  planId: string,
): Promise<void> {
  const plan = await tx.installmentPlan.findFirst({
    where: { id: planId, familyId: ctx.familyId },
    select: { importBatchId: true },
  });
  await assertImportNotReverted(tx, ctx, plan?.importBatchId);
}
