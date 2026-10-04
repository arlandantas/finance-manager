"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CategoryDTO,
  CreateTransactionInput,
  CreateTransactionResponse,
  TransactionDefaults,
} from "@/modules/transacoes/schemas";

export const categoriesKey = (kind: "EXPENSE" | "INCOME") => ["categories", kind] as const;
export const defaultsKey = ["transactions-defaults"] as const;

export function useCategories(kind: "EXPENSE" | "INCOME") {
  return useQuery({
    queryKey: categoriesKey(kind),
    queryFn: () => apiFetch<{ items: CategoryDTO[] }>(`/api/v1/categories?kind=${kind}`),
    staleTime: 5 * 60_000,
  });
}

export function useDefaults(enabled: boolean) {
  return useQuery({
    queryKey: defaultsKey,
    queryFn: () => apiFetch<TransactionDefaults>("/api/v1/transactions/defaults"),
    enabled,
    staleTime: 0,
  });
}

/** SDD-001 §5.1: contas, extrato, Home e acerto dependem de qualquer mutação de lançamento. */
export function useInvalidateAfterTransactionChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["accounts"], ["transactions"], ["home"], ["settlement"], [defaultsKey[0]]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateTransaction(idempotencyKey: string) {
  const invalidate = useInvalidateAfterTransactionChange();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiFetch<CreateTransactionResponse>("/api/v1/transactions", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
