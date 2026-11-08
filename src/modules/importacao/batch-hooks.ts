"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";

// US-069: transporte do cliente. Tipos só de transporte (sem importar o servidor).
export type ImportBatchItem = {
  id: string;
  invoiceRef: string;
  source: "CSV" | "PDF";
  importedAt: string;
  importedBy: string;
  itemCount: number;
  totalInCents: number;
  revertedAt: string | null;
  version: number;
  canRevert: boolean;
  revertBlockedReason: "REVERTED" | "INVOICE_PAID" | null;
};

export function useInvoiceImports(cardId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["invoice-imports", cardId],
    enabled,
    queryFn: () =>
      apiFetch<{ batches: ImportBatchItem[] }>(`/api/v1/cards/${cardId}/invoice-imports`),
  });
}

export type RevertInput = {
  batchId: string;
  version: number;
  confirmEditedItems?: boolean;
  confirmSettledPeriod?: boolean;
  idempotencyKey: string;
};

/** Desfaz o lote: a chave é da tentativa (muda quando o corpo muda, ex.: ao confirmar os editados). */
export function useRevertImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: RevertInput) =>
      apiFetch<{ batch: ImportBatchItem }>(`/api/v1/import-batches/${a.batchId}/revert`, {
        method: "POST",
        body: {
          version: a.version,
          ...(a.confirmEditedItems ? { confirmEditedItems: true } : {}),
          ...(a.confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
        },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [
          ["invoice-imports"],
          ["cards"],
          ["card"],
          ["invoice"],
          ["home"],
          ["payables"],
          ["transactions"],
          ["installment-plan"],
          ["settlement"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}
