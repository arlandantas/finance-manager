"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { FamilyDTO } from "@/modules/familia/schemas";

export const familyKey = ["family"] as const;

export function useFamily() {
  return useQuery({ queryKey: familyKey, queryFn: () => apiFetch<FamilyDTO>("/api/v1/family") });
}
