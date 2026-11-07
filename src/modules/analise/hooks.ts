"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { AnalysisDTO } from "@/modules/analise/schemas";
import { type AnaliseUrl, toAnaliseSearch } from "@/modules/analise/url";

export type AnalysisParams = AnaliseUrl;

/** Chave `["analysis", params]`: mutação de lançamento invalida o prefixo `["analysis"]`. */
export const analysisKey = (p: AnalysisParams) => ["analysis", p] as const;

export function useAnalysis(p: AnalysisParams) {
  return useQuery({
    queryKey: analysisKey(p),
    queryFn: () => apiFetch<AnalysisDTO>(`/api/v1/analysis?${toAnaliseSearch(p)}`),
    placeholderData: (prev) => prev,
  });
}
