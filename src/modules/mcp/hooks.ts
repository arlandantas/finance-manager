"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { AssistantSettingsDTO, ConnectionDTO } from "@/modules/mcp/connections-schemas";

export const assistantSettingsKey = ["assistant-settings"] as const;
export const assistantActivityKey = ["assistant-activity"] as const;
export const assistantLimitsKey = ["assistant-limits"] as const;

export function useAssistantSettings() {
  return useQuery({
    queryKey: assistantSettingsKey,
    queryFn: () => apiFetch<AssistantSettingsDTO>("/api/v1/assistant/settings"),
  });
}

function useInvalidateAssistant() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [assistantSettingsKey, assistantActivityKey, ["family"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

/** Revogar: sem atualização otimista (segurança: só muda com o 200). */
export function useRevokeConnection() {
  const invalidate = useInvalidateAssistant();
  return useMutation({
    mutationFn: (a: { id: string; idempotencyKey: string }) =>
      apiFetch<{ connection: ConnectionDTO }>(`/api/v1/assistant/connections/${a.id}/revoke`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useSetAssistantAccess() {
  const invalidate = useInvalidateAssistant();
  return useMutation({
    mutationFn: (a: { enabled: boolean; familyVersion: number; idempotencyKey: string }) =>
      apiFetch<AssistantSettingsDTO>("/api/v1/family/assistant-access", {
        method: "PATCH",
        body: { enabled: a.enabled, familyVersion: a.familyVersion },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
