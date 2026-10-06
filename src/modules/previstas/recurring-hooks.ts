"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreateRecurringExpenseInput,
  RecurringExpenseDTO,
  SeriesImpactDTO,
  UpdateRecurringExpenseInput,
} from "@/modules/previstas/recurring-schemas";

export const seriesKey = (id: string | null) => ["recurring", id] as const;

/** Criar/editar/encerrar série mexe nas previstas: invalida previstas, a pagar, Início e Resumo. */
function useInvalidateSeries() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["planned"], ["payables"], ["home"], ["summary"], ["recurring"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useSeries(id: string | null) {
  return useQuery({
    queryKey: seriesKey(id),
    queryFn: () => apiFetch<{ series: RecurringExpenseDTO }>(`/api/v1/recurring-expenses/${id}`),
    enabled: id !== null,
    staleTime: 0,
  });
}

export function useSeriesImpact(id: string | null, effectiveFrom: string | undefined) {
  return useQuery({
    queryKey: ["recurring", id, "impact", effectiveFrom ?? "current"],
    queryFn: () =>
      apiFetch<SeriesImpactDTO>(
        `/api/v1/recurring-expenses/${id}/impact${effectiveFrom ? `?effectiveFrom=${effectiveFrom}` : ""}`,
      ),
    enabled: id !== null,
    staleTime: 0,
  });
}

export function useCreateSeries(idempotencyKey: string) {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (input: CreateRecurringExpenseInput) =>
      apiFetch<{ series: RecurringExpenseDTO; generatedCount: number }>(
        "/api/v1/recurring-expenses",
        { method: "POST", body: input, idempotencyKey },
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateSeries(idempotencyKey: string) {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (a: { id: string; input: UpdateRecurringExpenseInput }) =>
      apiFetch<{ series: RecurringExpenseDTO; affectedCount: number }>(
        `/api/v1/recurring-expenses/${a.id}`,
        { method: "PATCH", body: a.input, idempotencyKey },
      ),
    onSuccess: invalidate,
  });
}

export function useEndSeries() {
  const invalidate = useInvalidateSeries();
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ series: RecurringExpenseDTO; removedCount: number }>(
        `/api/v1/recurring-expenses/${a.id}/end`,
        { method: "POST", body: { version: a.version }, idempotencyKey: a.idempotencyKey },
      ),
    onSuccess: invalidate,
  });
}
