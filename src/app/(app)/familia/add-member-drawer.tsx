"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateUnlinkedMember } from "@/modules/familia/hooks";
import { CreateUnlinkedMemberSchema } from "@/modules/familia/schemas";
import { useSplitRule } from "@/modules/split/hooks";

const NAME_CODES = ["NAME_TAKEN", "NAME_RESERVED"];
const EMAIL_CODES = ["DUPLICATE_MEMBER", "EMAIL_BELONGS_TO_OTHER_MEMBER"];
const NAME_MAX = 60;

/** Aviso de divisão (Q-TL-U1): só quando o acerto está ligado; lido de `GET /split-rule`. */
function SplitNotice({ name }: { name: string }) {
  const rule = useSplitRule();
  const kind = rule.data?.current.kind;
  // Reserva a altura enquanto a regra carrega ou não há nome, para o botão não se deslocar.
  if (!kind || !name) return <div aria-hidden="true" className="min-h-28" />;
  return (
    <p
      data-testid="split-notice"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
    >
      {kind === "EQUAL" ? (
        <>
          A divisão igual passará a incluir {name} nas despesas novas. Para não dividir com {name},
          use a divisão proporcional com 0%.{" "}
          <Link href="/acerto/regra" className="font-semibold underline">
            Regra de divisão
          </Link>
        </>
      ) : (
        <>A divisão proporcional precisará ser redefinida para incluir {name} (pode ser 0%).</>
      )}
    </p>
  );
}

/** Cadastrar membro sem conta (US-092b, SDD-033 §4.4): nome obrigatório, e-mail opcional. */
export function AddMemberDrawer({
  open,
  onOpenChange,
  settlementEnabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settlementEnabled: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreateUnlinkedMember(key);
  const typed = name.trim().replace(/\s+/g, " ");
  const shown = typed || "A pessoa";

  function reset() {
    setName("");
    setEmail("");
    setNameError(undefined);
    setEmailError(undefined);
    setBanner(null);
    setKey(newIdempotencyKey());
  }

  function submit() {
    if (submitting.current) return;
    setNameError(undefined);
    setEmailError(undefined);
    setBanner(null);
    const parsed = CreateUnlinkedMemberSchema.safeParse({ name, email: email.trim() });
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        if (i.path[0] === "email") setEmailError(i.message);
        else setNameError(i.message);
      }
      return;
    }
    submitting.current = true;
    create.mutate(
      { name: parsed.data.name, ...(parsed.data.email ? { email: parsed.data.email } : {}) },
      {
        onSuccess: (r) => {
          toast.success(`${r.member.name} cadastrado(a)`);
          reset();
          onOpenChange(false);
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && NAME_CODES.includes(e.code)) {
            setNameError(e.message);
            setKey(newIdempotencyKey());
          } else if (e instanceof ApiClientError && EMAIL_CODES.includes(e.code)) {
            setEmailError(e.message);
            setKey(newIdempotencyKey());
          } else if (
            e instanceof ApiClientError &&
            ["EMAIL_HAS_PENDING_INVITATION", "UNLINKED_MEMBER_LIMIT"].includes(e.code)
          ) {
            setBanner(e.message);
            setKey(newIdempotencyKey());
          } else setBanner("Não foi possível cadastrar. Tente de novo.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar membro"
      returnFocusId="add-member-btn"
    >
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
        <Field id="member-name" label="Nome" error={nameError} hint={`${name.length}/${NAME_MAX}`}>
          <TextInput
            id="member-name"
            autoComplete="off"
            maxLength={NAME_MAX + 20}
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setKey(newIdempotencyKey());
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "member-name-error" : undefined}
          />
        </Field>
        <Field
          id="member-email"
          label="E-mail (opcional)"
          error={emailError}
          hint="Só para convidar depois. Só Administradores veem."
        >
          <TextInput
            id="member-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setKey(newIdempotencyKey());
            }}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "member-email-error" : undefined}
          />
        </Field>
        <p className="text-sm text-slate-600">
          {shown} não terá acesso ao app nem receberá e-mail.
        </p>
        {settlementEnabled ? <SplitNotice name={typed} /> : null}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Cadastrando…" : "Cadastrar"}
        </Button>
      </form>
    </Drawer>
  );
}
