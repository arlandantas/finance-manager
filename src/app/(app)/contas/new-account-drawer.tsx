"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateAccount } from "@/modules/contas/hooks";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  CreateAccountSchema,
  INSTITUTION_SUGGESTIONS,
} from "@/modules/contas/schemas";
import { useFamily } from "@/modules/familia/hooks";
import { ReserveSwitch } from "./reserve-switch";

type FormInput = z.input<typeof CreateAccountSchema>;
type FormOutput = z.output<typeof CreateAccountSchema>;

export function NewAccountDrawer({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today?: string;
}) {
  // ADR-009: nova chave a cada abertura; reaproveitada nos reenvios até o sucesso.
  const [key, setKey] = useState(newIdempotencyKey);
  useEffect(() => {
    if (open) setKey(newIdempotencyKey());
  }, [open]);
  const family = useFamily();
  const create = useCreateAccount(key);
  const [banner, setBanner] = useState<string | null>(null);
  const [institutionChoice, setInstitutionChoice] = useState<string>("Outro");
  const [customInstitution, setCustomInstitution] = useState("");
  const submitting = useRef(false);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateAccountSchema),
    defaultValues: { name: "", institution: "Outro", openingBalanceInCents: 0 },
  });
  const { errors } = form.formState;

  // Titular padrão: o membro logado.
  const currentMemberId = family.data?.currentMemberId;
  useEffect(() => {
    if (open && currentMemberId && !form.getValues("ownerMemberId")) {
      form.setValue("ownerMemberId", currentMemberId);
    }
  }, [open, currentMemberId, form]);

  useEffect(() => {
    if (!open) {
      form.reset({ name: "", institution: "Outro", openingBalanceInCents: 0 });
      setBanner(null);
      setInstitutionChoice("Outro");
      setCustomInstitution("");
    }
  }, [open, form]);

  function updateInstitution(choice: string, custom: string) {
    setInstitutionChoice(choice);
    setCustomInstitution(custom);
    const value = choice === "Outro" ? custom.trim() || "Outro" : choice;
    form.setValue("institution", value, { shouldValidate: false });
  }

  const onSubmit = form.handleSubmit(
    (values) => {
      if (submitting.current) return;
      submitting.current = true;
      setBanner(null);
      create.mutate(values as FormInput, {
        onSuccess: () => {
          toast.success("Conta cadastrada com sucesso!");
          onOpenChange(false);
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "DUPLICATE_ACCOUNT_NAME") {
            form.setError("name", { message: e.message });
          } else if (
            e instanceof ApiClientError &&
            e.code === "VALIDATION_ERROR" &&
            Array.isArray(e.details)
          ) {
            for (const d of e.details as Array<{ path: string; message: string }>) {
              form.setError(d.path as keyof FormInput, { message: d.message });
            }
          } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      });
    },
    (invalid) => {
      const first = Object.keys(invalid)[0];
      if (first) form.setFocus(first as keyof FormInput);
    },
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Nova conta">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {banner ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {banner}
          </p>
        ) : null}

        <Field id="account-name" label="Nome" error={errors.name?.message}>
          <TextInput
            id="account-name"
            autoComplete="off"
            placeholder="Ex.: Itaú Mariana"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "account-name-error" : undefined}
            {...form.register("name")}
          />
        </Field>

        <Field id="account-institution" label="Instituição">
          <select
            id="account-institution"
            className={inputClass}
            value={institutionChoice}
            onChange={(e) => updateInstitution(e.target.value, customInstitution)}
          >
            {INSTITUTION_SUGGESTIONS.map((i) => (
              <option key={i} value={i}>
                {i === "Outro" ? "Outro (texto livre)" : i}
              </option>
            ))}
          </select>
        </Field>
        {institutionChoice === "Outro" ? (
          <Field id="account-institution-custom" label="Nome da instituição">
            <TextInput
              id="account-institution-custom"
              maxLength={40}
              value={customInstitution}
              onChange={(e) => updateInstitution("Outro", e.target.value)}
            />
          </Field>
        ) : null}

        <Field id="account-type" label="Tipo" error={errors.type?.message}>
          <select
            id="account-type"
            className={inputClass}
            aria-invalid={errors.type ? true : undefined}
            aria-describedby={errors.type ? "account-type-error" : undefined}
            defaultValue=""
            {...form.register("type")}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field id="account-owner" label="Titular" error={errors.ownerMemberId?.message}>
          <select id="account-owner" className={inputClass} {...form.register("ownerMemberId")}>
            {(family.data?.members ?? []).map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.name.split(" ")[0]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="account-balance"
          label="Saldo inicial"
          error={errors.openingBalanceInCents?.message}
          hint="Pode ser negativo (cheque especial)."
        >
          <Controller
            control={form.control}
            name="openingBalanceInCents"
            render={({ field }) => (
              <MoneyInput
                id="account-balance"
                allowNegative
                value={field.value ?? 0}
                onChange={field.onChange}
                invalid={Boolean(errors.openingBalanceInCents)}
              />
            )}
          />
        </Field>

        <Controller
          control={form.control}
          name="excludeFromAvailable"
          render={({ field }) => (
            <ReserveSwitch checked={field.value === true} onChange={field.onChange} />
          )}
        />

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
            Mais detalhes
          </summary>
          <div className="mt-3">
            <Field
              id="account-opening-date"
              label="Data de abertura"
              error={errors.openingDate?.message}
            >
              <input
                id="account-opening-date"
                type="date"
                className={inputClass}
                {...(today ? { max: today } : {})}
                {...form.register("openingDate", { setValueAs: (v) => (v ? v : undefined) })}
              />
            </Field>
          </div>
        </details>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Salvando…" : "Salvar conta"}
        </Button>
      </form>
    </Drawer>
  );
}
