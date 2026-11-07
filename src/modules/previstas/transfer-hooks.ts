"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreatePlannedTransferInput,
  CreateTransferSeriesParsed,
  PlannedTransferDTO,
  TransferSeriesDTO,
  TransferSeriesImpactDTO,
} from "@/modules/previstas/transfer-schemas";

/** US-100b (ADR-037): chave por período (`undefined` = corrente); começa com "planned-transfers". */
export const plannedTransfersKey = (period: string | undefined) =>
  ["planned-transfers", period ?? "current"] as const;

export function usePlannedTransfers(period: string | undefined) {
  return useQuery({
    queryKey: plannedTransfersKey(period),
    queryFn: () =>
      apiFetch<{ items: PlannedTransferDTO[] }>(
        `/api/v1/planned-transfers${period ? `?period=${period}` : ""}`,
      ),
    staleTime: 0,
  });
}

/** Pendentes de qualquer mês: a aba mostra as atrasadas no período corrente (como o "A pagar"). */
export function useOpenPlannedTransfers(enabled: boolean) {
  return useQuery({
    queryKey: ["planned-transfers", "open"],
    queryFn: () =>
      apiFetch<{ items: PlannedTransferDTO[] }>("/api/v1/planned-transfers?status=PREVISTA"),
    enabled,
    staleTime: 0,
  });
}

/** Criar/editar/excluir/efetivar: lista, resumo por conta, saldos, extrato e Início. */
function useInvalidateTransfers() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        ["planned-transfers"],
        ["recurring-transfers"],
        ["payables"],
        ["accounts"],
        ["transactions"],
        ["transaction"],
        ["home"],
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

export function useCreatePlannedTransfer(idempotencyKey: string) {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (input: CreatePlannedTransferInput) =>
      apiFetch<{ plannedTransfer: PlannedTransferDTO }>("/api/v1/planned-transfers", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlannedTransfer(idempotencyKey: string) {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (a: { id: string; input: Record<string, unknown> & { version: number } }) =>
      apiFetch<{ plannedTransfer: PlannedTransferDTO }>(`/api/v1/planned-transfers/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlannedTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ deleted: true }>(`/api/v1/planned-transfers/${a.id}/delete`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useRealizePlannedTransfer(idempotencyKey: string) {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (a: {
      id: string;
      input: { version: number; amountInCents?: number; occurredOn?: string };
    }) =>
      apiFetch<{ plannedTransfer: PlannedTransferDTO; transferGroupId: string }>(
        `/api/v1/planned-transfers/${a.id}/realize`,
        { method: "POST", body: a.input, idempotencyKey },
      ),
    onSuccess: invalidate,
  });
}

// US-101b: série mensal de transferência prevista.
const SERIES = "/api/v1/recurring-transfers";

export function useTransferSeries(id: string | null) {
  return useQuery({
    queryKey: ["recurring-transfers", id],
    queryFn: () => apiFetch<{ series: TransferSeriesDTO }>(`${SERIES}/${id}`),
    enabled: id !== null,
    staleTime: 0,
  });
}

/** Impacto de editar/encerrar a partir de um mês (`YYYY-MM`); lido antes de confirmar. */
export function useTransferSeriesImpact(id: string | null, impactFrom: string | undefined) {
  return useQuery({
    queryKey: ["recurring-transfers", id, "impact", impactFrom],
    queryFn: () =>
      apiFetch<{ series: TransferSeriesDTO; impact: TransferSeriesImpactDTO }>(
        `${SERIES}/${id}?impactFrom=${impactFrom}`,
      ),
    enabled: id !== null && Boolean(impactFrom),
    staleTime: 0,
  });
}

export function useCreateTransferSeries(idempotencyKey: string) {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (input: CreateTransferSeriesParsed) =>
      apiFetch<{ series: TransferSeriesDTO; generatedCount: number }>(SERIES, {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTransferSeries(idempotencyKey: string) {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (a: { id: string; input: Record<string, unknown> & { version: number } }) =>
      apiFetch<{ series: TransferSeriesDTO; affectedCount: number }>(`${SERIES}/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useEndTransferSeries() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ series: TransferSeriesDTO; removedCount: number }>(`${SERIES}/${a.id}/end`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
