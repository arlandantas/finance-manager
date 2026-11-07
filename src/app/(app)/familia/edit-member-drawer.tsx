"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCancelInvitation, useUpdateUnlinkedMember } from "@/modules/familia/hooks";
import { UpdateUnlinkedMemberSchema } from "@/modules/familia/schemas";

export type EditTarget = {
  memberId: string;
  name: string;
  pendingEmail: string | null;
  pendingInvitationId: string | null;
};

const NAME_CODES = ["NAME_TAKEN", "NAME_RESERVED"];
const EMAIL_CODES = ["DUPLICATE_MEMBER", "EMAIL_BELONGS_TO_OTHER_MEMBER"];
const NAME_MAX = 60;

/** Editar o membro sem conta (US-095): nome e e-mail (com "Remover e-mail"). Só ADMIN abre. */
export function EditMemberDrawer({
  target,
  onClose,
}: {
  target: EditTarget | null;
  onClose: () => void;
}) {
  return (
    <Drawer open={target !== null} onOpenChange={(o) => !o && onClose()} title="Editar membro">
      {target ? <EditForm key={target.memberId} target={target} onClose={onClose} /> : null}
    </Drawer>
  );
}

function EditForm({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const [name, setName] = useState(target.name);
  const [email, setEmail] = useState(target.pendingEmail ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const update = useUpdateUnlinkedMember(target.memberId, key);
  const cancel = useCancelInvitation();

  function fail(e: unknown) {
    setKey(newIdempotencyKey());
    if (e instanceof NetworkError) setBanner(e.message);
    else if (e instanceof ApiClientError && NAME_CODES.includes(e.code)) setNameError(e.message);
    else if (e instanceof ApiClientError && EMAIL_CODES.includes(e.code)) setEmailError(e.message);
    else if (e instanceof ApiClientError && e.code === "MEMBER_HAS_PENDING_INVITATION") {
      setBanner(e.message);
      setPendingInvitationId(target.pendingInvitationId);
    } else if (e instanceof ApiClientError) setBanner(e.message);
    else setBanner("Não foi possível salvar. Tente de novo.");
  }

  function submit(nextEmail: string | null) {
    if (submitting.current) return;
    setNameError(undefined);
    setEmailError(undefined);
    setBanner(null);
    setPendingInvitationId(null);
    const parsed = UpdateUnlinkedMemberSchema.safeParse({
      name,
      email: nextEmail === null || nextEmail.trim() === "" ? null : nextEmail.trim(),
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        if (i.path[0] === "email") setEmailError(i.message);
        else setNameError(i.message);
      }
      return;
    }
    submitting.current = true;
    update.mutate(parsed.data, {
      onSuccess: (r) => {
        toast.success(`${r.member.name} atualizado(a)`);
        onClose();
      },
      onError: fail,
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
        submit(email);
      }}
    >
      {banner ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          <p>{banner}</p>
          {pendingInvitationId ? (
            <Button
              type="button"
              variant="secondary"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { id: pendingInvitationId, idempotencyKey: newIdempotencyKey() },
                  {
                    onSuccess: () => {
                      toast.success("Convite cancelado");
                      setPendingInvitationId(null);
                      setBanner(null);
                    },
                    onError: (e) =>
                      setBanner(
                        e instanceof ApiClientError ? e.message : "Não foi possível cancelar.",
                      ),
                  },
                )
              }
            >
              {cancel.isPending ? "Cancelando…" : "Cancelar convite"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Field id="edit-name" label="Nome" error={nameError} hint={`${name.length}/${NAME_MAX}`}>
        <TextInput
          id="edit-name"
          autoComplete="off"
          maxLength={NAME_MAX + 20}
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setKey(newIdempotencyKey());
          }}
          aria-invalid={nameError ? true : undefined}
        />
      </Field>
      <Field
        id="edit-email"
        label="E-mail (opcional)"
        error={emailError}
        hint="Só para convidar depois. Só Administradores veem."
      >
        <TextInput
          id="edit-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setKey(newIdempotencyKey());
          }}
          aria-invalid={emailError ? true : undefined}
        />
      </Field>
      {target.pendingEmail ? (
        <Button
          type="button"
          variant="secondary"
          disabled={update.isPending}
          onClick={() => {
            setEmail("");
            submit(null);
          }}
        >
          Remover e-mail
        </Button>
      ) : null}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
