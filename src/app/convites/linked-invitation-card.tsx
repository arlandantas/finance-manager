"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";
import type {
  AcceptInvitationResponse,
  MyInvitationDTO,
} from "@/modules/familia/invitations/schemas";

const NAME_CODES = ["NAME_REQUIRED", "NAME_INVALID", "NAME_RESERVED", "NAME_TAKEN"];
const GONE_CODES = ["INVITATION_NOT_PENDING", "INVITATION_EXPIRED", "MEMBER_NO_LONGER_AVAILABLE"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * US-094b (ADR-038): convite vinculado a um cadastro. Mostra o que a pessoa vai assumir (só contagens) e pede o
 * nome dela; o vínculo só acontece no clique de "Assumir meu cadastro". O campo nunca vem do rótulo do cadastro.
 */
export function LinkedInvitationCard({
  invitation,
  onGone,
}: {
  invitation: MyInvitationDTO & { linked: NonNullable<MyInvitationDTO["linked"]> };
  onGone: (id: string) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const acceptKey = useRef(newIdempotencyKey());
  const declineKey = useRef(newIdempotencyKey());
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ user: { name: string | null } }>("/api/v1/me"),
  });
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? me.data?.user.name ?? "";
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { linked } = invitation;
  const base = `/api/v1/me/invitations/${invitation.id}`;

  const fail = (e: unknown) => {
    if (e instanceof NetworkError) setBanner(e.message);
    else if (e instanceof ApiClientError && NAME_CODES.includes(e.code)) setFieldError(e.message);
    else if (e instanceof ApiClientError && e.code === "ALREADY_IN_FAMILY") {
      setBanner("Você já faz parte de uma família. Para assumir este cadastro, saia da atual.");
    } else if (e instanceof ApiClientError && (GONE_CODES.includes(e.code) || e.status === 404)) {
      toast.error("Este convite não está mais disponível");
      onGone(invitation.id);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  };
  const accept = useMutation({
    mutationFn: () =>
      apiFetch<AcceptInvitationResponse>(`${base}/accept`, {
        method: "POST",
        body: { name },
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
      acceptKey.current = newIdempotencyKey(); // corpo diferente na próxima tentativa
      fail(e);
    },
  });
  const decline = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/decline`, { method: "POST", body: {}, idempotencyKey: declineKey.current }),
    onSuccess: () => {
      setConfirming(false);
      onGone(invitation.id);
    },
    onError: (e) => {
      setConfirming(false);
      fail(e);
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
      <p data-testid="linked-preview" className="text-sm text-slate-700">
        Você vai assumir o cadastro de <strong>{linked.label}</strong>:{" "}
        {plural(linked.accounts, "conta", "contas")}, {plural(linked.cards, "cartão", "cartões")},{" "}
        {plural(linked.transactions, "lançamento", "lançamentos")} e{" "}
        {plural(linked.planned, "prevista", "previstas")}.
      </p>
      {linked.wasMemberBefore ? (
        <p
          data-testid="linked-was-member"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          Você já foi membro desta família.
        </p>
      ) : null}
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFieldError(undefined);
          setBanner(null);
          accept.mutate();
        }}
      >
        <Field id={`linked-name-${invitation.id}`} label="Seu nome na família" error={fieldError}>
          <TextInput
            id={`linked-name-${invitation.id}`}
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(e) => {
              setTyped(e.target.value);
              acceptKey.current = newIdempotencyKey();
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `linked-name-${invitation.id}-error` : undefined}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={busy || me.isPending} className="sm:flex-1">
            {accept.isPending ? "Assumindo…" : "Assumir meu cadastro"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="sm:flex-1"
          >
            Recusar
          </Button>
        </div>
      </form>
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
