"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { CreateSubscriptionInput, SubscriptionDTO } from "@/modules/assinaturas/schemas";

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
