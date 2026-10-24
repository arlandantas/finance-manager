"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  AnalysisListItemDTO,
  AnalysisPreviewDTO,
  SentDataDTO,
  SpendingAnalysisDTO,
} from "@/modules/analise-ia/dto";

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
