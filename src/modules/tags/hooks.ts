"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { TagDTO } from "@/modules/tags/schemas";

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
