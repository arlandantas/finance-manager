"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { AiUsageDTO } from "@/modules/ia/dto";

export const aiUsageKey = ["ai-usage"] as const;

/** Só o Administrador consegue ler o consumo (403 para os demais): passe `enabled=false` ao membro. */
export function useAiUsage(enabled: boolean) {
  return useQuery({
    queryKey: aiUsageKey,
    enabled,
    queryFn: () => apiFetch<AiUsageDTO>("/api/v1/ai/usage"),
  });
}
