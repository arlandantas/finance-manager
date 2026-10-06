"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  AccountDTO,
  AccountsResponse,
  CreateAccountInput,
  CreateTransferInput,
  TransferDTO,
} from "@/modules/contas/schemas";

export const accountsKey = ["accounts"] as const;

export function useAccounts() {
  return useQuery({
    queryKey: accountsKey,
    queryFn: () => apiFetch<AccountsResponse>("/api/v1/accounts"),
  });
}

/** Contas arquivadas (seção recolhida de Contas). A chave começa com "accounts": toda invalidação a atinge. */
export function useArchivedAccounts() {
  return useQuery({
    queryKey: [...accountsKey, "archived"],
    queryFn: () => apiFetch<AccountsResponse>("/api/v1/accounts?archived=true"),
  });
}

/** Arquivar, reativar ou excluir (SDD-012 §3.1). */
export function useAccountAction() {
  const invalidate = useInvalidateAfterAccountChange();
  return useMutation({
    mutationFn: (a: {
      id: string;
      action: "archive" | "unarchive" | "delete";
      version: number;
      idempotencyKey: string;
    }) =>
      apiFetch<{ account?: AccountDTO; deleted?: true }>(`/api/v1/accounts/${a.id}/${a.action}`, {
        method: "POST",
        body: { version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

/** SDD-004 §5: contas, extrato e Home dependem do saldo. */
export function useInvalidateAfterAccountChange() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [["accounts"], ["transactions"], ["home"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateAccount(idempotencyKey: string) {
  const invalidate = useInvalidateAfterAccountChange();
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      apiFetch<AccountDTO>("/api/v1/accounts", { method: "POST", body: input, idempotencyKey }),
    onSuccess: invalidate,
  });
}

export function useRenameAccount() {
  const invalidate = useInvalidateAfterAccountChange();
  return useMutation({
    mutationFn: (a: {
      id: string;
      name?: string;
      excludeFromAvailable?: boolean;
      version: number;
      idempotencyKey: string;
    }) =>
      apiFetch<AccountDTO>(`/api/v1/accounts/${a.id}`, {
        method: "PATCH",
        body: { name: a.name, excludeFromAvailable: a.excludeFromAvailable, version: a.version },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useCreateTransfer(idempotencyKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransferInput) =>
      apiFetch<{ transfer: TransferDTO }>("/api/v1/transfers", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: () =>
      Promise.all(
        [["accounts"], ["transactions"], ["home"], ["settlement"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

/** Desfaz transferência/acerto (SDD-004 §4.4). Sem `version`, busca a versão atual do grupo. */
export function useUndoTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { groupId: string; version?: number; idempotencyKey: string }) => {
      const version =
        a.version ??
        (await apiFetch<{ transfer: TransferDTO }>(`/api/v1/transfers/${a.groupId}`)).transfer
          .version;
      return apiFetch<{ transfer: TransferDTO }>(`/api/v1/transfers/${a.groupId}/undo`, {
        method: "POST",
        body: { version },
        idempotencyKey: a.idempotencyKey,
      });
    },
    onSuccess: () =>
      Promise.all(
        [["accounts"], ["transactions"], ["transaction"], ["home"], ["settlement"]].map(
          (queryKey) => qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
