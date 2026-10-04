"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { HomeDTO } from "@/modules/home/schemas";

export const homeKey = (period?: string) => ["home", period ?? "current"] as const;

export function useHome(period?: string) {
  return useQuery({
    queryKey: homeKey(period),
    queryFn: () => apiFetch<HomeDTO>(`/api/v1/home${period ? `?period=${period}` : ""}`),
  });
}
