"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { AnalysisDTO } from "@/modules/analise/schemas";

export type AnalysisParams = { period?: string; from?: string; to?: string; type: string };

/** Chave `["analysis", params]`: mutação de lançamento invalida o prefixo `["analysis"]`. */
export const analysisKey = (p: AnalysisParams) => ["analysis", p] as const;

export function useAnalysis(p: AnalysisParams) {
  return useQuery({
    queryKey: analysisKey(p),
    queryFn: () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
      return apiFetch<AnalysisDTO>(`/api/v1/analysis?${qs}`);
    },
    placeholderData: (prev) => prev,
  });
}
