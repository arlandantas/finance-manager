"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreateSubscriptionInput,
  SubscriptionDTO,
  SubscriptionImpact,
  UpdateSubscriptionInput,
} from "@/modules/assinaturas/schemas";

export const subscriptionsKey = ["subscriptions"] as const;

export function useSubscriptions(f: { status: "active" | "ended"; cardId?: string }) {
  const qs = new URLSearchParams({ status: f.status });
  if (f.cardId) qs.set("cardId", f.cardId);
  return useQuery({
    queryKey: [...subscriptionsKey, f],
    queryFn: () => apiFetch<{ items: SubscriptionDTO[] }>(`/api/v1/subscriptions?${qs}`),
    // o GET lança o que venceu; sempre rebusca ao montar a tela do cartão
    staleTime: 0,
  });
}

/** Cadastrar mexe no bloco, na fatura (prevista), no limite, no Extrato e no Início. */
export function useCreateSubscription(idempotencyKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) =>
      apiFetch<{ subscription: SubscriptionDTO }>("/api/v1/subscriptions", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [["subscriptions"], ["cards"], ["card"], ["invoice"], ["transactions"], ["home"]].map(
          (queryKey) => qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all(
    [["subscriptions"], ["cards"], ["card"], ["invoice"], ["transactions"], ["home"]].map(
      (queryKey) => qc.invalidateQueries({ queryKey }),
    ),
  );

/** US-097: o aviso "Muda N próximas cobranças; M já lançadas ficam" para um reajuste a partir de `from`. */
export function useSubscriptionImpact(id: string | null, from: string | null) {
  return useQuery({
    queryKey: [...subscriptionsKey, "impact", id, from],
    enabled: id !== null && from !== null,
    queryFn: () =>
      apiFetch<{ subscription: SubscriptionDTO; impact: SubscriptionImpact }>(
        `/api/v1/subscriptions/${id}?impactFrom=${from}`,
      ),
    staleTime: 0,
  });
}

export function useUpdateSubscription(id: string, idempotencyKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSubscriptionInput) =>
      apiFetch<{ subscription: SubscriptionDTO }>(`/api/v1/subscriptions/${id}`, {
        method: "PATCH",
        body: input,
        idempotencyKey,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEndSubscription(id: string, idempotencyKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiFetch<{ subscription: SubscriptionDTO }>(`/api/v1/subscriptions/${id}/end`, {
        method: "POST",
        body: { version },
        idempotencyKey,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}
