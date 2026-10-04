"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import { categoriesKey } from "@/modules/categorias/hooks";
import type { CategoryDTO } from "@/modules/categorias/schemas";
import { accountsKey } from "@/modules/contas/hooks";
import type { AccountsResponse } from "@/modules/contas/schemas";
import { familyKey } from "@/modules/familia/hooks";
import type { FamilyDTO } from "@/modules/familia/schemas";
import {
  buildPendingItem,
  type InfiniteLedger,
  insertPending,
  type LedgerUiFilters,
} from "@/modules/transacoes/optimistic";
import type {
  CreateTransactionInput,
  CreateTransactionResponse,
  TransactionDefaults,
} from "@/modules/transacoes/schemas";

export const defaultsKey = ["transactions-defaults"] as const;

export function useDefaults(enabled: boolean) {
  return useQuery({
    queryKey: defaultsKey,
    queryFn: () => apiFetch<TransactionDefaults>("/api/v1/transactions/defaults"),
    enabled,
    staleTime: 0,
  });
}

/** SDD-001 §5.1: contas, extrato, Home e acerto dependem de qualquer mutação de lançamento. */
export function useInvalidateAfterTransactionChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["accounts"], ["transactions"], ["home"], ["settlement"], [defaultsKey[0]]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateTransaction(idempotencyKey: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateAfterTransactionChange();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiFetch<CreateTransactionResponse>("/api/v1/transactions", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    // SDD-001 §5.1: item provisório (`pending`) no topo dos extratos em cache que o admitem.
    // O saldo exibido só muda com a resposta do servidor.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions"] });
      const snapshots = qc.getQueriesData<InfiniteLedger>({ queryKey: ["transactions"] });
      const family = qc.getQueryData<FamilyDTO>(familyKey);
      const me = family?.members.find((m) => m.memberId === family.currentMemberId);
      const accounts = qc.getQueryData<AccountsResponse>(accountsKey);
      const categories = [
        ...(qc.getQueryData<{ items: CategoryDTO[] }>(categoriesKey(input.type))?.items ?? []),
      ];
      const defaults = qc.getQueryData<TransactionDefaults>(defaultsKey);
      if (family && me && accounts && defaults) {
        const pending = buildPendingItem(input, {
          today: defaults.today,
          me: { id: me.memberId, name: me.name, image: me.image },
          accounts: accounts.items.map((a) => ({ id: a.id, name: a.name })),
          categories,
          members: family.members.map((m) => ({ id: m.memberId, name: m.name, image: m.image })),
          now: new Date(),
          key: idempotencyKey,
        });
        if (pending) {
          for (const [queryKey, data] of snapshots) {
            const filters = (queryKey[1] ?? {}) as LedgerUiFilters;
            qc.setQueryData(queryKey, insertPending(data, pending, filters));
          }
        }
      }
      return { snapshots };
    },
    onError: (_e, _input, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) qc.setQueryData(queryKey, data);
    },
    onSuccess: invalidate,
  });
}

// ── Extrato ──
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ListTransactionsResponse, TransactionDetailDTO } from "@/modules/transacoes/schemas";

export function ledgerQueryString(filters: LedgerUiFilters, cursor?: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== undefined && v !== "") p.set(k, String(v));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

export function useLedger(filters: LedgerUiFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<ListTransactionsResponse>(
        `/api/v1/transactions?${ledgerQueryString(filters, pageParam)}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useTransactionDetail(id: string | null) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: () => apiFetch<{ transaction: TransactionDetailDTO }>(`/api/v1/transactions/${id}`),
    enabled: id !== null,
  });
}

// ── Correção, exclusão, restauração e histórico (US-013) ──
import type {
  RevisionDTO,
  TransactionStateInput,
  UpdateTransactionInput,
  UpdateTransactionResponse,
} from "@/modules/transacoes/schemas";

export function useHistory(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["transaction", id, "history"],
    queryFn: () => apiFetch<{ items: RevisionDTO[] }>(`/api/v1/transactions/${id}/history`),
    enabled: enabled && id !== null,
  });
}

function useInvalidateTransaction() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAfterTransactionChange();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["transaction"] });
    await invalidate();
  };
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateTransaction();
  return useMutation({
    mutationFn: (a: { id: string; input: UpdateTransactionInput; idempotencyKey: string }) =>
      apiFetch<UpdateTransactionResponse>(`/api/v1/transactions/${a.id}`, {
        method: "PATCH",
        body: a.input,
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useTransactionState(action: "delete" | "restore") {
  const invalidate = useInvalidateTransaction();
  return useMutation({
    mutationFn: (a: { id: string; input: TransactionStateInput; idempotencyKey: string }) =>
      apiFetch<{ transaction: TransactionDetailDTO }>(`/api/v1/transactions/${a.id}/${action}`, {
        method: "POST",
        body: a.input,
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
