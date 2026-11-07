"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";
import type {
  AcceptInvitationResponse,
  MyInvitationDTO,
} from "@/modules/familia/invitations/schemas";

const ROLE_LABEL = { ADMIN: "Administrador", MEMBER: "Membro" } as const;

function brShort(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * SEC-004 (SDD-028 §1.4): cartão do convite com Entrar e Recusar. O vínculo só acontece no clique.
 * `familyName` e `inviterName` são texto do Administrador: o React escapa (nada de HTML/markdown).
 */
export function InvitationCard({
  invitation,
  token,
  onGone,
}: {
  invitation: MyInvitationDTO;
  /** Presente quando o cartão vem de /convite/[token]. */
  token?: string;
  /** Chamado quando o convite deixa de existir (recusado ou indisponível); padrão: recarrega a página. */
  onGone?: (id: string) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const acceptKey = useRef(newIdempotencyKey());
  const declineKey = useRef(newIdempotencyKey());
  const [banner, setBanner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const gone = (id: string) => (onGone ? onGone(id) : router.refresh());

  const base = `/api/v1/me/invitations/${invitation.id}`;
  const accept = useMutation({
    mutationFn: () =>
      apiFetch<AcceptInvitationResponse>(`${base}/accept`, {
        method: "POST",
        body: token ? { token } : {},
        idempotencyKey: acceptKey.current,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["family"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
      router.replace("/?joined=1");
    },
    onError: (e) => {
      if (e instanceof NetworkError) setBanner(e.message);
      else if (e instanceof ApiClientError && e.code === "NAME_REQUIRED") {
        router.replace("/convites"); // convite vinculado ao cadastro: o nome é pedido lá (US-094b)
      } else if (e instanceof ApiClientError && e.code === "ALREADY_IN_FAMILY") {
        setBanner(
          "Você já faz parte de uma família. Para entrar em outra, saia da atual em Família.",
        );
      } else if (
        e instanceof ApiClientError &&
        (e.code === "INVITATION_NOT_PENDING" ||
          e.code === "INVITATION_EXPIRED" ||
          e.code === "NOT_FOUND")
      ) {
        toast.error("Este convite não está mais disponível");
        gone(invitation.id);
      } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
    },
  });
  const decline = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/decline`, {
        method: "POST",
        body: {},
        idempotencyKey: declineKey.current,
      }),
    onSuccess: () => {
      setConfirming(false);
      gone(invitation.id);
    },
    onError: (e) => {
      setConfirming(false);
      if (e instanceof ApiClientError && e.code === "INVITATION_NOT_PENDING") {
        toast.error("Este convite não está mais disponível");
        gone(invitation.id);
      } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
    },
  });
  const busy = accept.isPending || decline.isPending;

  return (
    <li
      data-testid="invitation-card"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:bg-slate-100"
    >
      <p className="text-base text-slate-900">
        <strong>{invitation.inviterName}</strong> convidou você para a{" "}
        <strong>{invitation.familyName}</strong>
      </p>
      <p className="text-sm text-slate-600">
        Papel: {ROLE_LABEL[invitation.role]} · Vence em {brShort(invitation.expiresAt)}
      </p>
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button disabled={busy} onClick={() => accept.mutate()} className="sm:flex-1">
          {accept.isPending ? "Entrando…" : `Entrar na ${invitation.familyName}`}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="sm:flex-1"
        >
          Recusar
        </Button>
      </div>
      <Drawer
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
        title={`Recusar o convite da ${invitation.familyName}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">Quem convidou verá que você recusou.</p>
          <Button variant="danger" disabled={decline.isPending} onClick={() => decline.mutate()}>
            {decline.isPending ? "Recusando…" : "Recusar convite"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </li>
  );
}
