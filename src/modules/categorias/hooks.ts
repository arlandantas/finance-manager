"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CategoryDTO,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/modules/categorias/schemas";

type Kind = "EXPENSE" | "INCOME";

/** SDD-007 §6: chave `["categories", kind, { includeArchived }]`; toda mutação invalida o prefixo. */
export const categoriesKey = (kind: Kind | "ALL", includeArchived = false) =>
  ["categories", kind, { includeArchived }] as const;

function categoriesUrl(kind: Kind | "ALL", includeArchived: boolean) {
  const p = new URLSearchParams();
  if (kind !== "ALL") p.set("kind", kind);
  if (includeArchived) p.set("includeArchived", "true");
  const qs = p.toString();
  return `/api/v1/categories${qs ? `?${qs}` : ""}`;
}

/** Categorias ativas do tipo (drawer de lançamento e de previstas). */
export function useCategories(kind: Kind, includeArchived = false) {
  return useQuery({
    queryKey: categoriesKey(kind, includeArchived),
    queryFn: () => apiFetch<{ items: CategoryDTO[] }>(categoriesUrl(kind, includeArchived)),
    staleTime: 5 * 60_000,
  });
}

/** Todas (ativas e arquivadas, dos dois tipos): filtro do extrato rotula "(arquivada)". */
export function useAllCategories() {
  return useQuery({
    queryKey: categoriesKey("ALL", true),
    queryFn: () => apiFetch<{ items: CategoryDTO[] }>(categoriesUrl("ALL", true)),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateAfterCategoryChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["categories"], ["transactions"], ["transaction"], ["home"], ["planned"], ["payables"]].map(
        (queryKey) => qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateCategory(idempotencyKey: string) {
  const invalidate = useInvalidateAfterCategoryChange();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiFetch<{ category: CategoryDTO }>("/api/v1/categories", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateAfterCategoryChange();
  return useMutation({
    mutationFn: (a: { id: string; input: UpdateCategoryInput; idempotencyKey: string }) =>
      apiFetch<{ category: CategoryDTO }>(`/api/v1/categories/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useCategoryState(action: "archive" | "unarchive") {
  const invalidate = useInvalidateAfterCategoryChange();
  return useMutation({
    mutationFn: (a: { id: string; version: number; idempotencyKey: string }) =>
      apiFetch<{ category: CategoryDTO }>(`/api/v1/categories/${a.id}/${action}`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
