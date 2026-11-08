"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCategories } from "@/modules/categorias/hooks";
import { useEditInstallment } from "@/modules/transacoes/hooks";
import {
  type EditInstallmentInput,
  EditInstallmentSchema,
} from "@/modules/transacoes/installment-schemas";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";

type Scope = EditInstallmentInput["scope"];

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: "ONLY_THIS", label: "Somente esta" },
  { value: "THIS_AND_NEXT", label: "Esta e as próximas" },
];

/** US-041: corrige valor, categoria, descrição e observação de UMA parcela (ou desta em diante). */
export function EditInstallmentForm({
  t,
  planVersion,
  onDone,
  onConflict,
  onSettled,
}: {
  t: TransactionDetailDTO;
  planVersion: number;
  onDone: () => void;
  onConflict: (message: string) => void;
  onSettled: (message: string, resend: () => void) => void;
}) {
  const categories = useCategories("EXPENSE");
  const [scope, setScope] = useState<Scope>("ONLY_THIS");
  const [cents, setCents] = useState(t.amountInCents);
  const [categoryId, setCategoryId] = useState(t.category?.id ?? "");
  const [description, setDescription] = useState(t.description);
  const [note, setNote] = useState(t.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const submitting = useRef(false);
  const update = useEditInstallment();

  const options = categories.data?.items ?? [];
  const categoryOptions =
    t.category && !options.some((c) => c.id === t.category?.id)
      ? [{ id: t.category.id, name: `${t.category.name} (arquivada)` }, ...options]
      : options;

  function payload(confirmSettledPeriod?: boolean): EditInstallmentInput {
    const nextNote = note.trim() === "" ? null : note;
    return {
      version: t.version,
      planVersion,
      scope,
      ...(cents !== t.amountInCents ? { amountInCents: cents } : {}),
      ...(categoryId !== (t.category?.id ?? "") ? { categoryId } : {}),
      ...(description !== t.description ? { description } : {}),
      ...(nextNote !== t.note ? { note: nextNote } : {}),
      ...(confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
    };
  }

  function send(confirmSettledPeriod?: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    if (confirmSettledPeriod) key.current = newIdempotencyKey();
    update.mutate(
      { id: t.id, input: payload(confirmSettledPeriod), idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Parcela atualizada");
          onDone();
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT")
            onConflict(e.message);
          else if (e instanceof ApiClientError && e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED")
            onSettled(e.message, () => send(true));
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  function submit() {
    const parsed = EditInstallmentSchema.safeParse(payload());
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    send();
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
      <p className="text-sm text-slate-700">
        Parcela {t.installment?.no}/{t.installment?.count}. A data e o número de parcelas não mudam.
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-800">Aplicar a</legend>
        {SCOPES.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm text-slate-900">
            <input
              type="radio"
              name="installment-scope"
              value={o.value}
              checked={scope === o.value}
              onChange={() => setScope(o.value)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <Field id="ei-amount" label="Valor da parcela" error={errors.amountInCents}>
        <MoneyInput
          id="ei-amount"
          large
          autoFocus
          value={cents}
          onChange={setCents}
          invalid={Boolean(errors.amountInCents)}
          describedBy={errors.amountInCents ? "ei-amount-error" : undefined}
        />
      </Field>
      <Field id="ei-category" label="Categoria" error={errors.categoryId}>
        <select
          id="ei-category"
          className={inputClass}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {categoryOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="ei-description" label="Descrição" error={errors.description}>
        <input
          id="ei-description"
          className={inputClass}
          maxLength={100}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field id="ei-note" label="Observação" error={errors.note}>
        <textarea
          id="ei-note"
          className={cn(inputClass, "min-h-20 py-2")}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={update.isPending}>
        {update.isPending ? "Salvando…" : "Salvar alterações"}
      </Button>
    </form>
  );
}
