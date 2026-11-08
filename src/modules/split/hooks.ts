"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { RulePreviewDTO } from "@/modules/split/preview";
import type {
  CreateSettlementInput,
  SettlementDTO,
  SettlementReviewDTO,
  SharedExpensesResponse,
  SplitHistoryResponse,
  SplitRuleDTO,
  SplitRuleInput,
} from "@/modules/split/schemas";

export const splitRuleKey = ["split-rule"] as const;
export const settlementKey = (period: string | undefined) =>
  ["settlement", period ?? "current"] as const;

export function useSplitRule() {
  return useQuery({
    queryKey: splitRuleKey,
    queryFn: () => apiFetch<SplitRuleDTO>("/api/v1/split-rule"),
  });
}

/** Regra, acerto e Home dependem da regra de divisão. */
export function useInvalidateAfterRuleChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [splitRuleKey[0], "settlement", "home"].map((queryKey) =>
        qc.invalidateQueries({ queryKey: [queryKey] }),
      ),
    );
}

export function usePutSplitRule(idempotencyKey: string) {
  const invalidate = useInvalidateAfterRuleChange();
  return useMutation({
    mutationFn: (input: SplitRuleInput) =>
      apiFetch<{ rule: SplitRuleDTO }>("/api/v1/split-rule", {
        method: "PUT",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useSettlement(period: string | undefined) {
  return useQuery({
    queryKey: settlementKey(period),
    queryFn: () =>
      apiFetch<SettlementDTO>(`/api/v1/settlement${period ? `?period=${period}` : ""}`),
  });
}

export function useSharedExpenses(period: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["settlement", period ?? "current", "expenses"],
    queryFn: () =>
      apiFetch<SharedExpensesResponse>(
        `/api/v1/settlement/expenses${period ? `?period=${period}` : ""}`,
      ),
    enabled,
  });
}

/** US-044: despesas "Só meu" do mês encerrado (só leitura). 409 com o acerto desligado: a tela já avisa. */
export function useSettlementReview(period: string | undefined) {
  return useQuery({
    queryKey: ["settlement", period ?? "current", "review"],
    queryFn: () =>
      apiFetch<SettlementReviewDTO>(
        `/api/v1/settlement/review${period ? `?period=${period}` : ""}`,
      ),
    retry: false,
  });
}

export function useDismissSettlementReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { period: string; idempotencyKey: string }) =>
      apiFetch<{ dismissed: true }>("/api/v1/settlement/review/dismiss", {
        method: "POST",
        body: { period: a.period },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlement"] }),
  });
}

export type { CreateSettlementInput };

export function useRegisterSettlement(idempotencyKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSettlementInput) =>
      apiFetch<{ settlement: SettlementDTO }>("/api/v1/settlements", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [["settlement"], ["accounts"], ["transactions"], ["home"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useSplitHistory(enabled: boolean) {
  return useQuery({
    queryKey: [...splitRuleKey, "history"],
    queryFn: () => apiFetch<SplitHistoryResponse>("/api/v1/split-rule/history"),
    enabled,
  });
}

/** Prévia da regra (US-031): sem cache, cancelável; só roda com entrada válida. */
export function useRulePreview(input: SplitRuleInput | null) {
  return useQuery({
    queryKey: ["split-rule-preview", input],
    queryFn: ({ signal }) =>
      apiFetch<RulePreviewDTO>("/api/v1/split-rule/preview", {
        method: "POST",
        body: input,
        signal,
      }),
    enabled: input !== null,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}
