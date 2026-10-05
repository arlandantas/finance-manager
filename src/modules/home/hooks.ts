"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { HomeDTO, MonthSummaryDTO } from "@/modules/home/schemas";

export const homeKey = (period?: string) => ["home", period ?? "current"] as const;

export function useHome(period?: string) {
  return useQuery({
    queryKey: homeKey(period),
    queryFn: () => apiFetch<HomeDTO>(`/api/v1/home${period ? `?period=${period}` : ""}`),
  });
}

// Prefixo "home": toda mutação que já invalida ["home"] invalida também o resumo de qualquer mês.
export const monthSummaryKey = (period: string) => ["home", "month-summary", period] as const;

/** Resumo de um mês específico (setas do card); o mês corrente vem pelo `useHome`. */
export function useMonthSummary(period: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: monthSummaryKey(period ?? "current"),
    queryFn: () => apiFetch<MonthSummaryDTO>(`/api/v1/month-summary?period=${period}`),
    enabled: enabled && period !== undefined,
  });
}
