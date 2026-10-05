"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http";
import type {
  CreateInvitationResponse,
  FamilyDTO,
  InvitationDTO,
  RemovalReviewDTO,
  Role,
  RotatedInvitationResponse,
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

export function useRemovalReview(memberId: string | null, self: boolean) {
  return useQuery({
    queryKey: ["removal-review", memberId, self],
    queryFn: () =>
      apiFetch<RemovalReviewDTO>(
        self ? "/api/v1/family/leave-review" : `/api/v1/members/${memberId}/removal-review`,
      ),
    enabled: memberId !== null,
    gcTime: 0,
    staleTime: 0,
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: {
      memberId: string;
      self: boolean;
      body: {
        acknowledgeSettlement: boolean;
        reassign: {
          accounts: Record<string, string>;
          cards: Record<string, string>;
          plannedTo?: string;
        };
      };
      idempotencyKey: string;
    }) =>
      apiFetch<{ removed?: true; left?: true }>(
        a.self ? "/api/v1/family/leave" : `/api/v1/members/${a.memberId}/remove`,
        { method: "POST", body: a.body, idempotencyKey: a.idempotencyKey },
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

function useInvalidateFamilyAll() {
  const qc = useQueryClient();
  return () => Promise.all(["family", "me"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/** PATCH /family (US-034): renomear. */
export function useUpdateFamily() {
  const invalidate = useInvalidateFamilyAll();
  return useMutation({
    mutationFn: (a: { version: number; name: string; idempotencyKey: string }) =>
      apiFetch<{ family: { name: string; version: number } }>("/api/v1/family", {
        method: "PATCH",
        body: { version: a.version, name: a.name },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

/** PATCH /members/:id (US-034): papel. */
export function useChangeRole() {
  const invalidate = useInvalidateFamilyAll();
  return useMutation({
    mutationFn: (a: { memberId: string; role: Role; idempotencyKey: string }) =>
      apiFetch<unknown>(`/api/v1/members/${a.memberId}`, {
        method: "PATCH",
        body: { role: a.role },
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}

/** Copiar link / Reenviar e-mail (US-039): rotacionam o token; o link anterior deixa de valer. */
export function useRotateInvitation() {
  const invalidate = useInvalidateFamilyAll();
  return useMutation({
    mutationFn: (a: { id: string; mode: "link" | "resend"; idempotencyKey: string }) =>
      apiFetch<RotatedInvitationResponse>(`/api/v1/invitations/${a.id}/${a.mode}`, {
        method: "POST",
        body: {},
        idempotencyKey: a.idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
