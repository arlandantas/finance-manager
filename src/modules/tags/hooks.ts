"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { DeleteTagResponse, MergeTagResponse, TagDTO } from "@/modules/tags/schemas";

/** SDD-016 §6: chave `["tags", { q }]`; criar/editar lançamento com tags invalida o prefixo `["tags"]`. */
export const tagsKey = (q: string) => ["tags", { q }] as const;

/** Sugestão ao digitar: prefixo de nameKey (lista curta). Sem `q`, todas por uso (filtro do Extrato). */
export function useTags(q: string, opts: { enabled?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? (q ? 8 : 200);
  return useQuery({
    queryKey: [...tagsKey(q), limit],
    queryFn: () =>
      apiFetch<{ items: TagDTO[] }>(
        `/api/v1/tags?${new URLSearchParams({ ...(q ? { q } : {}), limit: String(limit) })}`,
      ),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });
}

function useInvalidateAfterTagChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["tags"], ["transactions"], ["transaction"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

type Keyed = { id: string; idempotencyKey: string };

export function useRenameTag() {
  const invalidate = useInvalidateAfterTagChange();
  return useMutation({
    mutationFn: (a: Keyed & { version: number; name: string }) =>
      apiFetch<{ tag: TagDTO }>(`/api/v1/tags/${a.id}`, {
        method: "PATCH",
        body: { version: a.version, name: a.name },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useMergeTag() {
  const invalidate = useInvalidateAfterTagChange();
  return useMutation({
    mutationFn: (a: Keyed & { version: number; intoId: string }) =>
      apiFetch<MergeTagResponse>(`/api/v1/tags/${a.id}/merge`, {
        method: "POST",
        body: { version: a.version, intoId: a.intoId },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidateAfterTagChange();
  return useMutation({
    mutationFn: (a: Keyed & { version: number }) =>
      apiFetch<DeleteTagResponse>(`/api/v1/tags/${a.id}/delete`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
