"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/color-picker";
import { MoneyInput } from "@/components/money-input";
import { SourceSelect } from "@/components/source-select";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { cycleExplanation } from "@/modules/cartoes/cycle";
import { useCreateCard, useUpdateCard } from "@/modules/cartoes/hooks";
import { type CardDTO, CreateCardSchema, UpdateCardSchema } from "@/modules/cartoes/schemas";
import type { AccountColor } from "@/modules/contas/colors";
import { useAccounts } from "@/modules/contas/hooks";
import { INSTITUTION_SUGGESTIONS } from "@/modules/contas/schemas";
import { useSuggestedColor } from "@/modules/contas/use-suggested-color";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";

type FieldKey =
  | "name"
  | "limitInCents"
  | "closingDay"
  | "dueDay"
  | "ownerMemberId"
  | "institution"
  | "paymentAccountId"
  | "color";

const CYCLE_LOCKED_HINT =
  "Os dias de fechamento e vencimento não podem ser alterados porque já há compras neste cartão";

/** Drawer de novo cartão e de edição (SDD-008 §6). `card` nulo = criar. */
export function CardDrawer({
  open,
  card,
  onClose,
}: {
  open: boolean;
  card: CardDTO | null;
  onClose: () => void;
}) {
  const family = useFamily();
  const accounts = useAccounts();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [institutionChoice, setInstitutionChoice] = useState("Outro");
  const [customInstitution, setCustomInstitution] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [limit, setLimit] = useState(0);
  const [closing, setClosing] = useState("");
  const [due, setDue] = useState("");
  const [payerId, setPayerId] = useState("");
  const [payerTouched, setPayerTouched] = useState(false);
  const suggested = useSuggestedColor();
  const [picked, setPicked] = useState<AccountColor | null>(null);
  const color = picked ?? card?.color ?? suggested;
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreateCard(key);
  const update = useUpdateCard(key);
  const editing = card !== null;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBanner(null);
    setConflict(null);
    setPayerTouched(false);
    setPicked(null);
    setKey(newIdempotencyKey());
    if (card) {
      setName(card.name);
      const known = (INSTITUTION_SUGGESTIONS as readonly string[]).includes(card.institution);
      setInstitutionChoice(known ? card.institution : "Outro");
      setCustomInstitution(known ? "" : card.institution);
      setOwnerId(card.owner.id);
      setLimit(card.limitInCents);
      setClosing(String(card.closingDay));
      setDue(String(card.dueDay));
      // Arquivada: seletor vazio (D-TL-U8-2); o vínculo só muda se o usuário mexer no campo
      setPayerId(
        card.paymentAccount && !card.paymentAccount.archived ? card.paymentAccount.id : "",
      );
    } else {
      setName("");
      setInstitutionChoice("Outro");
      setCustomInstitution("");
      setOwnerId("");
      setLimit(0);
      setClosing("");
      setDue("");
      setPayerId("");
    }
  }, [open, card]);

  const currentMemberId = family.data?.currentMemberId;
  useEffect(() => {
    if (open && !card && currentMemberId) setOwnerId((cur) => cur || currentMemberId);
  }, [open, card, currentMemberId]);

  const institution =
    institutionChoice === "Outro" ? customInstitution.trim() || "Outro" : institutionChoice;
  const toDay = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const closingDay = toDay(closing);
  const dueDay = toDay(due);
  const sentence =
    closingDay && dueDay && closingDay >= 1 && closingDay <= 28 && dueDay >= 1 && dueDay <= 28
      ? cycleExplanation(closingDay, dueDay)
      : null;

  function fieldsFrom(issues: Array<{ path: string; message: string }>) {
    const out: Partial<Record<FieldKey, string>> = {};
    for (const i of issues) {
      const k = i.path.split(".")[0] as FieldKey;
      if (!out[k]) out[k] = i.message;
    }
    return out;
  }

  function onError(e: unknown) {
    if (e instanceof NetworkError) setBanner(e.message);
    else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT") setConflict(e.message);
    else if (e instanceof ApiClientError && e.code === "DUPLICATE_CARD_NAME")
      setErrors({ name: e.message });
    else if (e instanceof ApiClientError && Array.isArray(e.details)) {
      const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
      setErrors(next);
      if (Object.keys(next).length === 0) setBanner(e.message);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function submit() {
    if (submitting.current) return;
    const base = {
      name,
      institution,
      ...(ownerId ? { ownerMemberId: ownerId } : {}),
      limitInCents: limit,
      color,
      ...(closingDay !== undefined ? { closingDay } : {}),
      ...(dueDay !== undefined ? { dueDay } : {}),
      // só envia quando o usuário mexeu (evita PATCH e evento falsos)
      ...((card ? payerTouched : payerId !== "") ? { paymentAccountId: payerId || null } : {}),
    };
    const parsed = card
      ? UpdateCardSchema.safeParse({ ...base, version: card.version })
      : CreateCardSchema.safeParse(base);
    if (!parsed.success) {
      setErrors(
        fieldsFrom(
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    const done = {
      onSuccess: () => {
        toast.success(card ? "Cartão atualizado" : "Cartão cadastrado com sucesso!");
        onClose();
      },
      onError,
      onSettled: () => {
        submitting.current = false;
      },
    };
    if (card) update.mutate({ id: card.id, input: parsed.data as never }, done);
    else create.mutate(parsed.data as never, done);
  }

  const pending = create.isPending || update.isPending;
  const locked = card?.cycleLocked ?? false;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar cartão" : "Novo cartão"}
    >
      {conflict ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflict}
          </p>
          <Button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["cards"] });
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
      ) : (
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
          <Field id="card-name" label="Nome" error={errors.name}>
            <TextInput
              id="card-name"
              autoFocus
              autoComplete="off"
              placeholder="Ex.: Nubank Mariana"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
            />
          </Field>
          <Field id="card-institution" label="Instituição">
            <select
              id="card-institution"
              className={inputClass}
              value={institutionChoice}
              onChange={(e) => setInstitutionChoice(e.target.value)}
            >
              {INSTITUTION_SUGGESTIONS.map((i) => (
                <option key={i} value={i}>
                  {i === "Outro" ? "Outro (texto livre)" : i}
                </option>
              ))}
            </select>
          </Field>
          {institutionChoice === "Outro" ? (
            <Field id="card-institution-custom" label="Nome da instituição">
              <TextInput
                id="card-institution-custom"
                maxLength={40}
                value={customInstitution}
                onChange={(e) => setCustomInstitution(e.target.value)}
              />
            </Field>
          ) : null}
          <Field
            id="card-owner"
            label="Titular"
            error={errors.ownerMemberId}
            {...(card?.owner.unlinked && !card.owner.removed && family.data?.currentRole !== "ADMIN"
              ? { hint: "Só um Administrador pode trocar o titular." }
              : {})}
          >
            <select
              id="card-owner"
              className={inputClass}
              value={ownerId}
              // SEC-042/047: só o titular atual troca o titular; US-093a: titular sem conta ativo, só o Administrador
              disabled={
                !!card &&
                !!family.data &&
                card.owner.id !== family.data.currentMemberId &&
                !(card.owner.unlinked && !card.owner.removed && family.data.currentRole === "ADMIN")
              }
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {(family.data?.members ?? []).map((m) => (
                <option
                  key={m.memberId}
                  value={m.memberId}
                  disabled={m.unlinked && family.data?.currentRole !== "ADMIN"}
                >
                  {memberOptionLabel({
                    name: m.name.split(" ")[0] as string,
                    unlinked: m.unlinked,
                  })}
                  {m.unlinked && family.data?.currentRole !== "ADMIN" ? " (só Administrador)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field id="card-limit" label="Limite" error={errors.limitInCents}>
            <MoneyInput
              id="card-limit"
              value={limit}
              onChange={setLimit}
              invalid={Boolean(errors.limitInCents)}
              describedBy={errors.limitInCents ? "card-limit-error" : undefined}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="card-closing" label="Dia de fechamento" error={errors.closingDay}>
              <TextInput
                id="card-closing"
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                placeholder="1 a 28"
                value={closing}
                disabled={locked}
                onChange={(e) => setClosing(e.target.value)}
                aria-invalid={errors.closingDay ? true : undefined}
                aria-describedby={locked ? "card-cycle-hint" : undefined}
              />
            </Field>
            <Field id="card-due" label="Dia de vencimento" error={errors.dueDay}>
              <TextInput
                id="card-due"
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                placeholder="1 a 28"
                value={due}
                disabled={locked}
                onChange={(e) => setDue(e.target.value)}
                aria-invalid={errors.dueDay ? true : undefined}
                aria-describedby={locked ? "card-cycle-hint" : undefined}
              />
            </Field>
          </div>
          {locked ? (
            <p id="card-cycle-hint" className="text-sm text-slate-600">
              {CYCLE_LOCKED_HINT}
            </p>
          ) : sentence ? (
            <p data-testid="cycle-explanation" className="text-sm text-slate-600">
              {sentence}
            </p>
          ) : null}
          {card?.paymentAccount?.archived && !payerTouched ? (
            <p role="status" className="text-sm font-medium text-amber-900 dark:text-amber-200">
              A conta {card.paymentAccount.name} foi arquivada. Escolha outra ou deixe sem conta.
            </p>
          ) : null}
          <ColorPicker id="card-color" value={color} onChange={setPicked} error={errors.color} />
          <Field
            id="card-payer"
            label="Conta que paga a fatura"
            error={errors.paymentAccountId}
            hint={
              accounts.data && accounts.data.items.length === 0
                ? "Cadastre uma conta para escolher"
                : "Só sugere: você confirma a conta ao pagar."
            }
          >
            <SourceSelect
              id="card-payer"
              color={accounts.data?.items.find((a) => a.id === payerId)?.color}
              value={payerId}
              disabled={accounts.isPending}
              aria-invalid={errors.paymentAccountId ? true : undefined}
              onChange={(e) => {
                setPayerId(e.target.value);
                setPayerTouched(true);
              }}
            >
              {accounts.isPending ? (
                <option value="">Carregando contas…</option>
              ) : (
                <>
                  <option value="">Nenhuma (escolho ao pagar)</option>
                  {(accounts.data?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </>
              )}
            </SourceSelect>
          </Field>
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar cartão"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
