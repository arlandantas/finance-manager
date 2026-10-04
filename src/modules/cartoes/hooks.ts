"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CardDTO,
  CardsResponse,
  CreateCardInput,
  UpdateCardInput,
} from "@/modules/cartoes/schemas";

export const cardsKey = ["cards"] as const;

export function useCards() {
  return useQuery({
    queryKey: cardsKey,
    queryFn: () => apiFetch<CardsResponse>("/api/v1/cards"),
  });
}

function useInvalidateAfterCardChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["cards"], ["card"], ["invoice"], ["home"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateCard(idempotencyKey: string) {
  const invalidate = useInvalidateAfterCardChange();
  return useMutation({
    mutationFn: (input: CreateCardInput) =>
      apiFetch<{ card: CardDTO }>("/api/v1/cards", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateCard(idempotencyKey: string) {
  const invalidate = useInvalidateAfterCardChange();
  return useMutation({
    mutationFn: (a: { id: string; input: UpdateCardInput }) =>
      apiFetch<{ card: CardDTO }>(`/api/v1/cards/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
