"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateInvitation } from "@/modules/familia/hooks";
import {
  type CreateInvitationResponse,
  CreateInvitationSchema,
  type Role,
} from "@/modules/familia/schemas";

/** Formulário de convite (drawer da tela Família e passo do onboarding). */
export function InviteForm({
  showRole = true,
  onDone,
  submitLabel = "Enviar convite",
}: {
  showRole?: boolean;
  onDone?: (r: CreateInvitationResponse) => void;
  submitLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [failed, setFailed] = useState<CreateInvitationResponse | null>(null);
  // ADR-009: a chave vale até o sucesso; muda quando o e-mail/papel muda (corpo diferente).
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreateInvitation(key);

  function submit() {
    if (submitting.current) return;
    const parsed = CreateInvitationSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Informe um e-mail válido");
      return;
    }
    setError(undefined);
    setBanner(null);
    submitting.current = true;
    create.mutate(
      { email: parsed.data.email, role: parsed.data.role },
      {
        onSuccess: (r) => {
          setKey(newIdempotencyKey());
          if (r.emailStatus === "FAILED") {
            setFailed(r);
            return;
          }
          toast.success(`Convite enviado para ${r.invitation.email}`);
          setEmail("");
          onDone?.(r);
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (
            e instanceof ApiClientError &&
            ["DUPLICATE_MEMBER", "DUPLICATE_INVITATION", "VALIDATION_ERROR"].includes(e.code)
          ) {
            setError(e.message);
            setKey(newIdempotencyKey());
          } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Convite criado, mas o e-mail não foi enviado
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(failed.inviteUrl);
              toast.success("Link copiado");
            } catch {
              toast.error("Não foi possível copiar. Selecione o link abaixo.");
            }
          }}
        >
          Copiar link do convite
        </Button>
        <input
          readOnly
          aria-label="Link do convite"
          value={failed.inviteUrl}
          className={inputClass}
        />
        <Button
          onClick={() => {
            const r = failed;
            setFailed(null);
            setEmail("");
            onDone?.(r);
          }}
        >
          Concluir
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {banner}
        </p>
      ) : null}
      <Field id="invite-email" label="E-mail Google" error={error}>
        <TextInput
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="parceiro@exemplo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setKey(newIdempotencyKey());
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-email-error" : undefined}
        />
      </Field>
      {showRole ? (
        <Field id="invite-role" label="Papel">
          <select
            id="invite-role"
            className={inputClass}
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role);
              setKey(newIdempotencyKey());
            }}
          >
            <option value="MEMBER">Membro</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </Field>
      ) : null}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Enviando…" : submitLabel}
      </Button>
    </form>
  );
}
