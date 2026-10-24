"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  AnalysisListItemDTO,
  AnalysisPreviewDTO,
  AvoidableDismissalDTO,
  CategorySuggestionDTO,
  SentDataDTO,
  SpendingAnalysisDTO,
} from "@/modules/analise-ia/dto";
import { useInvalidateAfterTransactionChange } from "@/modules/transacoes/hooks";

// SDD-023 §6: chaves de cache da análise.
export const previewKey = (period: string | undefined) =>
  ["ai-analysis-preview", period ?? "default"] as const;
export const analysesKey = ["ai-analyses"] as const;
export const analysisKey = (id: string) => ["ai-analysis", id] as const;
export const sentDataKey = (id: string) => ["ai-analysis-sent", id] as const;

export function useAnalysisPreview(period: string | undefined) {
  return useQuery({
    queryKey: previewKey(period),
    queryFn: () =>
      apiFetch<AnalysisPreviewDTO>(
        `/api/v1/ai/spending-analysis/preview${period ? `?period=${period}` : ""}`,
      ),
    staleTime: 0,
  });
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: analysisKey(id),
    queryFn: () => apiFetch<SpendingAnalysisDTO>(`/api/v1/ai/spending-analyses/${id}`),
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: analysesKey,
    queryFn: () => apiFetch<{ items: AnalysisListItemDTO[] }>("/api/v1/ai/spending-analyses"),
  });
}

export function useSentData(id: string, enabled: boolean) {
  return useQuery({
    queryKey: sentDataKey(id),
    enabled,
    queryFn: () => apiFetch<SentDataDTO>(`/api/v1/ai/spending-analyses/${id}/sent-data`),
  });
}

/** Envia a análise. `signal` aborta o `fetch` (botão "Cancelar"): nada é salvo. */
export function useRequestAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      period: string;
      previewHash: string;
      idempotencyKey: string;
      signal: AbortSignal;
    }) =>
      apiFetch<SpendingAnalysisDTO>("/api/v1/ai/spending-analyses", {
        method: "POST",
        body: { period: a.period, previewHash: a.previewHash },
        idempotencyKey: a.idempotencyKey,
        signal: a.signal,
      }),
    onSuccess: (dto) => {
      qc.setQueryData(analysisKey(dto.id), dto);
      return Promise.all(
        [analysesKey, ["ai-analysis-preview"], ["ai-usage"], ["ai-settings"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

export const dismissalsKey = ["ai-dismissals"] as const;

export function useDismissals() {
  return useQuery({
    queryKey: dismissalsKey,
    queryFn: () => apiFetch<{ items: AvoidableDismissalDTO[] }>("/api/v1/ai/avoidable-dismissals"),
  });
}

function useInvalidateDismissals() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [dismissalsKey, ["ai-analysis"], ["ai-analysis-preview"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

/** "Importante para nós" (US-071): sem atualização otimista; a lista só muda com o 201. */
export function useCreateDismissal() {
  const invalidate = useInvalidateDismissals();
  return useMutation({
    mutationFn: (a: { analysisId: string; key: string; reason?: string; idempotencyKey: string }) =>
      apiFetch<AvoidableDismissalDTO>("/api/v1/ai/avoidable-dismissals", {
        method: "POST",
        body: { analysisId: a.analysisId, key: a.key, ...(a.reason ? { reason: a.reason } : {}) },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

/** "Voltar a sugerir" e o "Desfazer" do aviso. */
export function useRestoreDismissal() {
  const invalidate = useInvalidateDismissals();
  return useMutation({
    mutationFn: (a: { id: string; idempotencyKey: string }) =>
      apiFetch<{ restored: true }>(`/api/v1/ai/avoidable-dismissals/${a.id}/restore`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

function useInvalidateHistory() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [analysesKey, ["ai-analysis"], ["ai-analysis-sent"], ["ai-analysis-preview"]].map(
        (queryKey) => qc.invalidateQueries({ queryKey }),
      ),
    );
}

/** US-073: sem atualização otimista; a lista muda com o 200. */
export function useDeleteAnalysis() {
  const invalidate = useInvalidateHistory();
  return useMutation({
    mutationFn: (a: { id: string; idempotencyKey: string }) =>
      apiFetch<{ deleted: number }>(`/api/v1/ai/spending-analyses/${a.id}/delete`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteAllAnalyses() {
  const invalidate = useInvalidateHistory();
  return useMutation({
    mutationFn: (a: { idempotencyKey: string }) =>
      apiFetch<{ deleted: number }>("/api/v1/ai/spending-analyses/delete-all", {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

// ── US-072: sugestões locais de categoria (sem IA) ──
export const suggestionsKey = ["category-suggestions"] as const;

export function useCategorySuggestions() {
  return useQuery({
    queryKey: suggestionsKey,
    queryFn: () => apiFetch<{ items: CategorySuggestionDTO[] }>("/api/v1/category-suggestions"),
  });
}

/** Aceitar UMA sugestão (ou desfazer o aceite). Categoria muda Resumo, Extrato e Análise: invalida tudo. */
export function useAcceptSuggestion() {
  const qc = useQueryClient();
  const invalidateFinancial = useInvalidateAfterTransactionChange();
  return useMutation({
    mutationFn: (a: {
      transactionId: string;
      version: number;
      fromCategoryId: string;
      toCategoryId: string;
      undo?: boolean;
      idempotencyKey: string;
    }) =>
      apiFetch<{ transaction: { id: string; version: number } }>(
        "/api/v1/category-suggestions/accept",
        {
          method: "POST",
          body: {
            transactionId: a.transactionId,
            version: a.version,
            fromCategoryId: a.fromCategoryId,
            toCategoryId: a.toCategoryId,
            ...(a.undo ? { undo: true } : {}),
          },
          idempotencyKey: a.idempotencyKey,
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: suggestionsKey }),
        qc.invalidateQueries({ queryKey: ["ai-analysis"] }),
        qc.invalidateQueries({ queryKey: ["ai-analysis-preview"] }),
        invalidateFinancial(),
      ]);
    },
  });
}

export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { descriptionKey: string; toCategoryId: string; idempotencyKey: string }) =>
      apiFetch<{ dismissed: true }>("/api/v1/category-suggestions/dismiss", {
        method: "POST",
        body: { descriptionKey: a.descriptionKey, toCategoryId: a.toCategoryId },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: suggestionsKey }),
  });
}
