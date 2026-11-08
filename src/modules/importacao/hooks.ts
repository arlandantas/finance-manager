"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "@/lib/http";
import type { ConfirmImportBody } from "./confirm-schema";
import type { ImportDraft } from "./schemas";

// US-067b: transporte do cliente. Tipos só de transporte (sem importar o servidor).
export type PdfPreviewDTO = {
  source: "PDF";
  lines: { ref: string; text: string }[];
  previewHash: string;
  estimate?: { estimateInCents: number };
};
export type PreviewResponse = ImportDraft | PdfPreviewDTO;
export const isPdfPreview = (r: PreviewResponse): r is PdfPreviewDTO =>
  "lines" in r && r.source === "PDF";

export type UploadInput = { cardId: string; file: File; invoiceRef: string; password?: string };

function formOf(a: UploadInput, previewHash?: string): FormData {
  const f = new FormData();
  f.set("file", a.file);
  f.set("invoiceRef", a.invoiceRef);
  if (a.password) f.set("password", a.password);
  if (previewHash) f.set("previewHash", previewHash);
  return f;
}

/** Não grava nada: CSV devolve o rascunho; PDF devolve as linhas redigidas (sem chamar a IA). */
export function useImportPreview() {
  return useMutation({
    mutationFn: (a: UploadInput) =>
      apiUpload<PreviewResponse>(`/api/v1/cards/${a.cardId}/invoice-imports/preview`, formOf(a)),
  });
}

/** Só PDF, só depois de o membro ver as linhas: reenvia o mesmo arquivo + `previewHash`. */
export function useImportExtract() {
  return useMutation({
    mutationFn: (a: UploadInput & { previewHash: string }) =>
      apiUpload<ImportDraft>(
        `/api/v1/cards/${a.cardId}/invoice-imports/extract`,
        formOf(a, a.previewHash),
      ),
  });
}

export type ConfirmResponse = { batch: { id: string; itemCount: number } };

/** A chave de idempotência é da tentativa (o componente a mantém no reenvio). */
export function useConfirmImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { cardId: string; body: ConfirmImportBody; idempotencyKey: string }) =>
      apiFetch<ConfirmResponse>(`/api/v1/cards/${a.cardId}/invoice-imports`, {
        method: "POST",
        body: a.body,
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [
          ["cards"],
          ["card"],
          ["invoice"],
          ["home"],
          ["payables"],
          ["transactions"],
          ["installment-plan"],
          ["invoice-imports"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}
