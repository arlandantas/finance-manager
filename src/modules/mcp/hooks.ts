"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { ActivityResponse } from "@/modules/mcp/activity-schemas";
import type { AssistantSettingsDTO, ConnectionDTO } from "@/modules/mcp/connections-schemas";
import type { AssistantLimitsDTO, AssistantLimitsInput } from "@/modules/mcp/limits-schemas";
import type { NewConnectionNoticeDTO } from "@/modules/mcp/new-connection";
import type { AssistantReviewDTO } from "@/modules/mcp/review";

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
    onSuccess: async () => {
      await invalidate();
    },
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

/** US-074c: chave "Token pessoal" do Administrador. */
export function useSetPatEnabled() {
  const invalidate = useInvalidateAssistant();
  return useMutation({
    mutationFn: (a: { patEnabled: boolean; familyVersion: number; idempotencyKey: string }) =>
      apiFetch<AssistantSettingsDTO>("/api/v1/family/assistant-access", {
        method: "PATCH",
        body: { patEnabled: a.patEnabled, familyVersion: a.familyVersion },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export type CreatePatArgs = {
  label: string;
  validityDays: 7 | 30 | 90;
  allowWrite: boolean;
  idempotencyKey: string;
};

/**
 * US-074c: cria o token pessoal. O valor (`token`) só existe na resposta: quem chama o copia para o estado do
 * diálogo e chama `reset()`; `gcTime: 0` não o mantém no cache de mutações. Nunca em URL, storage ou log.
 */
export function useCreatePat() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (a: CreatePatArgs) =>
      apiFetch<{ connection: ConnectionDTO; token?: string; tokenRedacted?: boolean }>(
        "/api/v1/assistant/tokens",
        {
          method: "POST",
          body: {
            label: a.label,
            validityDays: a.validityDays,
            ...(a.allowWrite ? { allowWrite: true, writeAcknowledged: true } : {}),
          },
          idempotencyKey: a.idempotencyKey,
        },
      ),
    onSuccess: () =>
      Promise.all(
        [assistantSettingsKey, assistantActivityKey, newConnectionsKey].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
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

// ── Limites de lançamento (US-076b) ──
export function useAssistantLimits() {
  return useQuery({
    queryKey: assistantLimitsKey,
    queryFn: () => apiFetch<AssistantLimitsDTO>("/api/v1/assistant/limits"),
  });
}

/** Salvar limites: sem atualização otimista (só muda com o 200). */
export function usePutAssistantLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { input: AssistantLimitsInput; idempotencyKey: string }) =>
      apiFetch<AssistantLimitsDTO>("/api/v1/assistant/limits", {
        method: "PUT",
        body: a.input,
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [assistantLimitsKey, assistantActivityKey].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

// ── Conferência dos lançamentos via assistente (cartão da Home, US-076a) ──
export const assistantReviewKey = ["assistant-review"] as const;

export function useAssistantReview() {
  return useQuery({
    queryKey: assistantReviewKey,
    queryFn: () => apiFetch<AssistantReviewDTO>("/api/v1/assistant/review"),
  });
}

export function useMarkAssistantReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      apiFetch<AssistantReviewDTO>("/api/v1/assistant/reviewed", {
        method: "POST",
        body: {},
        idempotencyKey,
      }),
    onSuccess: (data) => qc.setQueryData(assistantReviewKey, data),
  });
}

// ── Aviso de conexão nova (cartão da Home, SEC-011) ──
export const newConnectionsKey = ["assistant-new-connections"] as const;

export function useNewConnectionNotices() {
  return useQuery({
    queryKey: newConnectionsKey,
    queryFn: () => apiFetch<NewConnectionNoticeDTO>("/api/v1/assistant/new-connections"),
  });
}

export function useDismissNewConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; idempotencyKey: string }) =>
      apiFetch<NewConnectionNoticeDTO>(`/api/v1/assistant/new-connections/${a.id}/dismiss`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: (data) => qc.setQueryData(newConnectionsKey, data),
  });
}
