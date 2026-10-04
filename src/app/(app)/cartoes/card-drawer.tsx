"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { cycleExplanation } from "@/modules/cartoes/cycle";
import { useCreateCard, useUpdateCard } from "@/modules/cartoes/hooks";
import { type CardDTO, CreateCardSchema, UpdateCardSchema } from "@/modules/cartoes/schemas";
import { INSTITUTION_SUGGESTIONS } from "@/modules/contas/schemas";
import { useFamily } from "@/modules/familia/hooks";

type FieldKey = "name" | "limitInCents" | "closingDay" | "dueDay" | "ownerMemberId" | "institution";

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
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [institutionChoice, setInstitutionChoice] = useState("Outro");
  const [customInstitution, setCustomInstitution] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [limit, setLimit] = useState(0);
  const [closing, setClosing] = useState("");
  const [due, setDue] = useState("");
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
    } else {
      setName("");
      setInstitutionChoice("Outro");
      setCustomInstitution("");
      setOwnerId("");
      setLimit(0);
      setClosing("");
      setDue("");
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
      ...(closingDay !== undefined ? { closingDay } : {}),
      ...(dueDay !== undefined ? { dueDay } : {}),
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
          <Field id="card-owner" label="Titular" error={errors.ownerMemberId}>
            <select
              id="card-owner"
              className={inputClass}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {(family.data?.members ?? []).map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.name.split(" ")[0]}
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
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar cartão"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
