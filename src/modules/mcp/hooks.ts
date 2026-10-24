"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { ActivityResponse } from "@/modules/mcp/activity-schemas";
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

/** Atividade do assistente (US-077): paginada por cursor, sempre do membro da sessão. */
export function useAssistantActivity(f: {
  grantId?: string;
  range?: "7d" | "30d" | "month";
  from?: string;
  to?: string;
}) {
  return useInfiniteQuery({
    queryKey: [...assistantActivityKey, f],
    initialPageParam: "" as string,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams();
      if (f.grantId) q.set("grantId", f.grantId);
      if (f.range) q.set("range", f.range);
      if (f.from) q.set("from", f.from);
      if (f.to) q.set("to", f.to);
      if (pageParam) q.set("cursor", pageParam);
      return apiFetch<ActivityResponse>(`/api/v1/assistant/activity?${q.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
