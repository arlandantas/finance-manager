"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreateInvitationResponse,
  FamilyDTO,
  InvitationDTO,
  Role,
} from "@/modules/familia/schemas";

export const familyKey = ["family"] as const;

export function useFamily() {
  return useQuery({ queryKey: familyKey, queryFn: () => apiFetch<FamilyDTO>("/api/v1/family") });
}

// ── Convites (US-003) ──

export function useInvalidateFamily() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: familyKey }),
      qc.invalidateQueries({ queryKey: ["me"] }),
    ]);
}

export function useCreateInvitation(idempotencyKey: string) {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (input: { email: string; role: Role }) =>
      apiFetch<CreateInvitationResponse>("/api/v1/invitations", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export function useCancelInvitation() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (a: { id: string; idempotencyKey: string }) =>
      apiFetch<{ invitation: InvitationDTO }>(`/api/v1/invitations/${a.id}/cancel`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

export type SettlementPending = {
  pendingInCents: number;
  months: Array<{ period: string; toSettleInCents: number }>;
};

/** PATCH /family/settings (US-028): desliga/liga o acerto; invalida tudo que depende dele. */
export function useUpdateFamilySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      version: number;
      settlementEnabled: boolean;
      confirmPending?: boolean;
      idempotencyKey: string;
    }) =>
      apiFetch<{ family: { settlementEnabled: boolean; version: number } }>(
        "/api/v1/family/settings",
        {
          method: "PATCH",
          body: {
            version: a.version,
            settlementEnabled: a.settlementEnabled,
            ...(a.confirmPending ? { confirmPending: true } : {}),
          },
          idempotencyKey: a.idempotencyKey,
        },
      ),
    onSuccess: () =>
      Promise.all(
        ["family", "me", "home", "settlement", "split-rule", "transactions"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}
