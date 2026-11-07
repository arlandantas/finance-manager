"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateLinkedInvitation } from "@/modules/familia/hooks";
import { CreateLinkedInvitationSchema } from "@/modules/familia/schemas";

const EMAIL_CODES = [
  "DUPLICATE_MEMBER",
  "EMAIL_BELONGS_TO_OTHER_MEMBER",
  "INVITATION_EMAIL_MISMATCH",
];

/** Convidar o membro sem conta (US-094a): e-mail pré-preenchido com o cadastrado; quem aceitar assume o histórico. */
export function InviteUnlinkedDrawer({
  target,
  onClose,
}: {
  target: { memberId: string; name: string; pendingEmail: string | null } | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Convidar para o app"
    >
      {target ? (
        <InviteUnlinkedForm key={target.memberId} target={target} onClose={onClose} />
      ) : null}
    </Drawer>
  );
}

function InviteUnlinkedForm({
  target,
  onClose,
}: {
  target: { memberId: string; name: string; pendingEmail: string | null };
  onClose: () => void;
}) {
  const [email, setEmail] = useState(target.pendingEmail ?? "");
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreateLinkedInvitation(target.memberId, key);

  function submit() {
    if (submitting.current) return;
    setError(undefined);
    setBanner(null);
    const parsed = CreateLinkedInvitationSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Informe um e-mail válido");
      return;
    }
    submitting.current = true;
    create.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(
          r.emailStatus === "FAILED"
            ? "Convite criado, mas o e-mail falhou. Use Copiar link."
            : `Convite enviado para ${r.invitation.email}`,
        );
        onClose();
      },
      onError: (e) => {
        setKey(newIdempotencyKey());
        if (e instanceof NetworkError) setBanner(e.message);
        else if (e instanceof ApiClientError && EMAIL_CODES.includes(e.code)) setError(e.message);
        else if (e instanceof ApiClientError) setBanner(e.message);
        else setBanner("Não foi possível convidar. Tente de novo.");
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <form
      noValidate
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      <Field id="invite-unlinked-email" label="E-mail" error={error}>
        <TextInput
          id="invite-unlinked-email"
          type="email"
          autoComplete="off"
          autoFocus
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setKey(newIdempotencyKey());
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-unlinked-email-error" : undefined}
        />
      </Field>
      <p
        data-testid="invite-unlinked-notice"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
      >
        Quem aceitar assume o histórico de {target.name}.
      </p>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}
