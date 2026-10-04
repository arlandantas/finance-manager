"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CardDTO,
  CardsResponse,
  CreateCardInput,
  InvoiceDTO,
  UpdateCardInput,
} from "@/modules/cartoes/schemas";

export const cardsKey = ["cards"] as const;

export function useCards() {
  return useQuery({
    queryKey: cardsKey,
    queryFn: () => apiFetch<CardsResponse>("/api/v1/cards"),
    // Limite/fatura mudam por ações de outros membros: sempre rebusca ao montar uma tela de cartões.
    staleTime: 0,
  });
}

export function useCard(id: string) {
  return useQuery({
    queryKey: ["card", id],
    queryFn: () => apiFetch<{ card: CardDTO }>(`/api/v1/cards/${id}`),
  });
}

/** Fatura do cartão (`ref` nulo: aguarda o cartão para usar a fatura aberta). */
export function useInvoice(cardId: string, ref: string | null) {
  return useQuery({
    queryKey: ["invoice", cardId, ref],
    queryFn: () => apiFetch<{ invoice: InvoiceDTO }>(`/api/v1/cards/${cardId}/invoices/${ref}`),
    enabled: ref !== null,
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
