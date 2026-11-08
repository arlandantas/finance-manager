import type { Tx } from "@/lib/api/types";

// US-068 (ADR-042 §12): lotes de importação da família na exportação. SÓ metadados (hash do arquivo, fonte,
// contagem, total, quem, quando); nunca o conteúdo nem o nome do arquivo.
export async function exportImportBatches(tx: Tx, familyId: string) {
  const rows = await tx.importBatch.findMany({
    where: { familyId },
    orderBy: [{ importedAt: "asc" }, { id: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    cartaoId: b.cardId,
    faturaId: b.invoiceId,
    hashDoArquivo: b.fileHash,
    fonte: b.source,
    quantidadeDeItens: b.itemCount,
    totalEmCentavos: Number(b.totalInCents),
    importadoPorId: b.importedByMemberId,
    importadoEm: b.importedAt.toISOString(),
    desfeitoEm: b.revertedAt ? b.revertedAt.toISOString() : null,
    desfeitoPorId: b.revertedByMemberId,
  }));
}
