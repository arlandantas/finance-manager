"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { AiPurposeDTO, AiSettingsDTO, AiUsageDTO } from "@/modules/ia/dto";

export const aiUsageKey = ["ai-usage"] as const;
export const aiSettingsKey = ["ai-settings"] as const;

/** Só o Administrador consegue ler o consumo (403 para os demais): passe `enabled=false` ao membro. */
export function useAiUsage(enabled: boolean) {
  return useQuery({
    queryKey: aiUsageKey,
    enabled,
    queryFn: () => apiFetch<AiUsageDTO>("/api/v1/ai/usage"),
  });
}

/** Estado dos recursos de IA da família (todos os membros). */
export function useAiSettings() {
  return useQuery({
    queryKey: aiSettingsKey,
    queryFn: () => apiFetch<AiSettingsDTO>("/api/v1/ai/settings"),
  });
}

function useInvalidateAi() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [aiSettingsKey, aiUsageKey, ["family"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

/** Consentimento é decisão do Administrador: sem atualização otimista, o estado só muda com o 200. */
export function useEnableConsent() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (a: {
      purpose: AiPurposeDTO;
      textVersion: number;
      familyVersion: number;
      idempotencyKey: string;
    }) =>
      apiFetch<AiSettingsDTO>(`/api/v1/ai/consents/${a.purpose}/enable`, {
        method: "POST",
        body: { textVersion: a.textVersion, familyVersion: a.familyVersion },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useDisableConsent() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: (a: { purpose: AiPurposeDTO; familyVersion: number; idempotencyKey: string }) =>
      apiFetch<AiSettingsDTO>(`/api/v1/ai/consents/${a.purpose}/disable`, {
        method: "POST",
        body: { familyVersion: a.familyVersion },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
