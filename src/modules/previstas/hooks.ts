"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreatePlannedExpenseInput,
  PayablesResponse,
  PayPlannedExpenseInput,
  PayPlannedResponse,
  PlannedExpenseDTO,
  PlannedListResponse,
  ReceivablesResponse,
  UpdatePlannedExpenseInput,
} from "@/modules/previstas/schemas";

/** SDD-009 §5: chaves `["planned", { period, status }]` e `["payables", period]`. */
export type PlannedKindFilter = "EXPENSE" | "INCOME" | "ALL";
export const plannedKey = (
  period: string | undefined,
  status?: "PREVISTO" | "PAGO",
  kind: PlannedKindFilter = "EXPENSE",
) => ["planned", { period: period ?? "current", status: status ?? "ALL", kind }] as const;
export const payablesKey = (period: string | undefined) =>
  ["payables", period ?? "current"] as const;
export const receivablesKey = (period: string | undefined) =>
  ["receivables", period ?? "current"] as const;

/** US-051: "A receber" (receitas previstas pendentes do período). */
export function useReceivables(period: string | undefined) {
  return useQuery({
    queryKey: receivablesKey(period),
    queryFn: () =>
      apiFetch<ReceivablesResponse>(`/api/v1/receivables${period ? `?period=${period}` : ""}`),
    staleTime: 0,
  });
}

export function usePayables(period: string | undefined) {
  return useQuery({
    queryKey: payablesKey(period),
    queryFn: () =>
      apiFetch<PayablesResponse>(`/api/v1/payables${period ? `?period=${period}` : ""}`),
    staleTime: 0,
  });
}

export function usePlannedList(
  period: string | undefined,
  status: "PREVISTO" | "PAGO",
  kind: PlannedKindFilter = "EXPENSE",
) {
  return useQuery({
    queryKey: plannedKey(period, status, kind),
    queryFn: () => {
      const p = new URLSearchParams({ status, kind });
      if (period) p.set("period", period);
      return apiFetch<PlannedListResponse>(`/api/v1/planned-expenses?${p.toString()}`);
    },
    staleTime: 0,
  });
}

export function usePlanned(id: string | null) {
  return useQuery({
    queryKey: ["planned", "detail", id],
    queryFn: () =>
      apiFetch<{ plannedExpense: PlannedExpenseDTO }>(`/api/v1/planned-expenses/${id}`),
    enabled: id !== null,
    staleTime: 0,
  });
}

/** Criar/editar/excluir invalidam previstas, a pagar e Home; baixa/desfazer também contas e extrato. */
export function useInvalidatePlanned(withLedger = false) {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        ["planned"],
        ["payables"],
        ["receivables"],
        ["home"],
        ["month-summary"],
        ...(withLedger
          ? [["accounts"], ["transactions"], ["transaction"], ["settlement"], ["analysis"]]
          : []),
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

export function useCreatePlanned(idempotencyKey: string) {
  const invalidate = useInvalidatePlanned();
  return useMutation({
    mutationFn: (input: CreatePlannedExpenseInput) =>
      apiFetch<{ plannedExpense: PlannedExpenseDTO }>("/api/v1/planned-expenses", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanned(idempotencyKey: string) {
  const invalidate = useInvalidatePlanned();
  return useMutation({
    mutationFn: (a: { id: string; input: UpdatePlannedExpenseInput }) =>
      apiFetch<{ plannedExpense: PlannedExpenseDTO }>(`/api/v1/planned-expenses/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlanned() {
  const invalidate = useInvalidatePlanned();
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ deleted: true }>(`/api/v1/planned-expenses/${a.id}/delete`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function usePayPlanned(idempotencyKey: string) {
  const invalidate = useInvalidatePlanned(true);
  return useMutation({
    mutationFn: (a: { id: string; input: PayPlannedExpenseInput }) =>
      apiFetch<PayPlannedResponse>(`/api/v1/planned-expenses/${a.id}/pay`, {
        method: "POST",
        body: a.input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUndoPlannedPayment() {
  const invalidate = useInvalidatePlanned(true);
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ plannedExpense: PlannedExpenseDTO }>(
        `/api/v1/planned-expenses/${a.id}/undo-payment`,
        { method: "POST", body: { version: a.version }, idempotencyKey: a.idempotencyKey },
      ),
    onSuccess: invalidate,
  });
}
