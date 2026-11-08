"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type { ConnectionDTO } from "@/modules/mcp/connections-schemas";
import { assistantActivityKey, assistantSettingsKey } from "@/modules/mcp/hooks";
import type { ConfirmProposalResult, ProposalDTO } from "@/modules/mcp/proposals-schemas";
import { useInvalidateAfterTransactionChange } from "@/modules/transacoes/hooks";

// US-076c: proposta do assistente (tela de confirmação) e modo "exigir confirmação" por conexão.
export const proposalKey = (id: string) => ["assistant-proposal", id] as const;

export function useProposal(id: string) {
  return useQuery({
    queryKey: proposalKey(id),
    queryFn: () => apiFetch<{ proposal: ProposalDTO }>(`/api/v1/assistant/proposals/${id}`),
  });
}

/** Sem atualização otimista: só muda com o 200 do servidor. */
export function useDecideProposal(id: string, action: "confirm" | "reject") {
  const qc = useQueryClient();
  const invalidateTx = useInvalidateAfterTransactionChange();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      apiFetch<ConfirmProposalResult | { proposal: ProposalDTO }>(
        `/api/v1/assistant/proposals/${id}/${action}`,
        { method: "POST", body: {}, idempotencyKey },
      ),
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: proposalKey(id) }),
        qc.invalidateQueries({ queryKey: assistantActivityKey }),
        invalidateTx(),
      ]);
    },
  });
}

export function useSetConfirmation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      id: string;
      requireConfirmation: boolean;
      riskAcknowledged?: true;
      idempotencyKey: string;
    }) =>
      apiFetch<{ connection: ConnectionDTO }>(
        `/api/v1/assistant/connections/${a.id}/confirmation`,
        {
          method: "PATCH",
          body: {
            requireConfirmation: a.requireConfirmation,
            ...(a.riskAcknowledged ? { riskAcknowledged: true } : {}),
          },
          idempotencyKey: a.idempotencyKey,
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: assistantSettingsKey }),
        qc.invalidateQueries({ queryKey: assistantActivityKey }),
      ]);
    },
  });
}
