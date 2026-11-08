import type { ImportSource } from "@/generated/prisma/client";
import { notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { activePayments } from "@/modules/cartoes/queries";
import { transacoesRepo } from "@/modules/transacoes/repo";
import { memberRefOf } from "@/modules/transacoes/service";

// US-069: lotes do cartão (só metadados: nunca nome nem conteúdo do arquivo; ADR-042 §12).
export type ImportBatchDTO = {
  id: string;
  invoiceRef: string;
  source: ImportSource;
  importedAt: string;
  importedBy: string;
  itemCount: number;
  totalInCents: number;
  revertedAt: string | null;
  version: number;
  canRevert: boolean;
  revertBlockedReason: "REVERTED" | "INVOICE_PAID" | null;
};

type Row = {
  id: string;
  invoiceId: string;
  source: ImportSource;
  importedAt: Date;
  importedByMemberId: string;
  itemCount: number;
  totalInCents: bigint;
  revertedAt: Date | null;
  version: number;
  invoice: { referenceMonth: string };
};

/** Faturas (ids) com item ativo de cada lote: só pagamento ativo nelas trava a reversão. */
async function activeInvoicesByBatch(tx: Tx, ctx: RequestContext, batchIds: string[]) {
  const rows = await tx.transaction.findMany({
    where: { familyId: ctx.familyId, importBatchId: { in: batchIds }, deletedAt: null },
    select: { importBatchId: true, invoiceId: true },
  });
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.importBatchId || !r.invoiceId) continue;
    const set = map.get(r.importBatchId) ?? new Set<string>();
    set.add(r.invoiceId);
    map.set(r.importBatchId, set);
  }
  return map;
}

export async function toBatchDTOs(
  tx: Tx,
  ctx: RequestContext,
  rows: readonly Row[],
): Promise<ImportBatchDTO[]> {
  if (rows.length === 0) return [];
  const members = new Map(
    (await transacoesRepo(tx, ctx.familyId).listMembers()).map(
      (m) => [m.id, memberRefOf(m).name] as const,
    ),
  );
  const byBatch = await activeInvoicesByBatch(
    tx,
    ctx,
    rows.map((r) => r.id),
  );
  const paid = await activePayments(tx, ctx.familyId, [
    ...new Set([...byBatch.values()].flatMap((s) => [...s])),
  ]);
  return rows.map((r) => {
    const reason = r.revertedAt
      ? ("REVERTED" as const)
      : [...(byBatch.get(r.id) ?? [])].some((id) => paid.has(id))
        ? ("INVOICE_PAID" as const)
        : null;
    return {
      id: r.id,
      invoiceRef: r.invoice.referenceMonth,
      source: r.source,
      importedAt: r.importedAt.toISOString(),
      importedBy: members.get(r.importedByMemberId) ?? "Ex-membro",
      itemCount: r.itemCount,
      totalInCents: toCents(r.totalInCents),
      revertedAt: r.revertedAt?.toISOString() ?? null,
      version: r.version,
      canRevert: reason === null,
      revertBlockedReason: reason,
    };
  });
}

export async function listInvoiceImports(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
): Promise<{ batches: ImportBatchDTO[] }> {
  const card = await tx.creditCard.findFirst({
    where: { id: cardId, familyId: ctx.familyId },
    select: { id: true },
  });
  if (!card) throw notFound("Cartão não encontrado.");
  const rows = await tx.importBatch.findMany({
    where: { familyId: ctx.familyId, cardId },
    include: { invoice: { select: { referenceMonth: true } } },
    orderBy: [{ importedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return { batches: await toBatchDTOs(tx, ctx, rows) };
}
