"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import { useUpdateTransaction } from "@/modules/transacoes/hooks";
import { type TransactionDetailDTO, UpdateTransactionSchema } from "@/modules/transacoes/schemas";

type FieldKey =
  | "amountInCents"
  | "accountId"
  | "categoryId"
  | "occurredOn"
  | "description"
  | "note"
  | "payerMemberId";

export function EditTransactionForm({
  t,
  today,
  onDone,
  onConflict,
  onSettled,
}: {
  t: TransactionDetailDTO;
  today: string | undefined;
  onDone: () => void;
  onConflict: (message: string) => void;
  /** 409 SETTLED_PERIOD_CONFIRMATION_REQUIRED: o pai pede confirmação e reenvia. */
  onSettled: (message: string, resend: () => void) => void;
}) {
  const kind = t.type === "INCOME" ? "INCOME" : "EXPENSE";
  const accounts = useAccounts();
  const family = useFamily();
  const categories = useCategories(kind);
  const [cents, setCents] = useState(t.amountInCents);
  const [accountId, setAccountId] = useState(t.account.id);
  const [categoryId, setCategoryId] = useState(t.category?.id ?? "");
  const [payerId, setPayerId] = useState(t.payer?.id ?? "");
  const [shared, setShared] = useState(t.isSharedExpense);
  const [date, setDate] = useState(t.occurredOn);
  const [description, setDescription] = useState(t.description);
  const [note, setNote] = useState(t.note ?? "");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const submitting = useRef(false);
  const update = useUpdateTransaction();

  function payload(confirmSettledPeriod?: boolean) {
    return {
      version: t.version,
      accountId,
      categoryId,
      amountInCents: cents,
      occurredOn: date,
      payerMemberId: payerId,
      description,
      note: note.trim() === "" ? null : note,
      ...(kind === "EXPENSE" ? { isSharedExpense: shared } : {}),
      ...(confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
    };
  }

  function fieldsFrom(issues: Array<{ path: string; message: string }>) {
    const out: Partial<Record<FieldKey, string>> = {};
    for (const i of issues) {
      const k = i.path.split(".")[0] as FieldKey;
      if (!out[k]) out[k] = i.message;
    }
    return out;
  }

  function send(confirmSettledPeriod?: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    // O corpo mudou ao confirmar o mês acertado: nova chave (SDD-001 §5.2).
    if (confirmSettledPeriod) key.current = newIdempotencyKey();
    update.mutate(
      { id: t.id, input: payload(confirmSettledPeriod), idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Lançamento atualizado");
          onDone();
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT")
            onConflict(e.message);
          else if (e instanceof ApiClientError && e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED")
            onSettled(e.message, () => send(true));
          else if (e instanceof ApiClientError && Array.isArray(e.details)) {
            const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
            setErrors(next);
            if (Object.keys(next).length === 0) setBanner(e.message);
          } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  function submit() {
    const parsed = UpdateTransactionSchema.safeParse(payload());
    if (!parsed.success) {
      const next = fieldsFrom(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.amountInCents) document.getElementById("ed-amount")?.focus();
      return;
    }
    setErrors({});
    send();
  }

  // A categoria atual pode ter sido arquivada depois do lançamento: continua selecionável.
  const activeCategories = categories.data?.items ?? [];
  const categoryOptions =
    t.category && !activeCategories.some((c) => c.id === t.category?.id)
      ? [
          {
            id: t.category.id,
            name: t.category.archived ? `${t.category.name} (arquivada)` : t.category.name,
          },
          ...activeCategories,
        ]
      : activeCategories;

  const select = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    options: Array<{ id: string; name: string }>,
    error?: string,
  ) => (
    <Field id={id} label={label} error={error}>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={error ? true : undefined}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );

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
      <Field id="ed-amount" label="Valor" error={errors.amountInCents}>
        <MoneyInput
          id="ed-amount"
          large
          autoFocus
          value={cents}
          onChange={setCents}
          invalid={Boolean(errors.amountInCents)}
          describedBy={errors.amountInCents ? "ed-amount-error" : undefined}
        />
      </Field>
      {select(
        "ed-account",
        "Conta",
        accountId,
        setAccountId,
        accounts.data?.items ?? [],
        errors.accountId,
      )}
      {select(
        "ed-category",
        "Categoria",
        categoryId,
        setCategoryId,
        categoryOptions,
        errors.categoryId,
      )}
      {select(
        "ed-payer",
        kind === "INCOME" ? "Quem recebeu?" : "Quem pagou?",
        payerId,
        setPayerId,
        (family.data?.members ?? []).map((m) => ({
          id: m.memberId,
          name: m.name.split(" ")[0] ?? m.name,
        })),
        errors.payerMemberId,
      )}
      {kind === "EXPENSE" ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span id="ed-shared-label" className="text-sm font-medium text-slate-800">
            Dividir com a família
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={shared}
            aria-labelledby="ed-shared-label"
            onClick={() => setShared((v) => !v)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              shared ? "bg-brand-700" : "bg-slate-300",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
                shared ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </div>
      ) : null}
      <Field id="ed-date" label="Data" error={errors.occurredOn}>
        <input
          id="ed-date"
          type="date"
          className={inputClass}
          value={date}
          {...(today ? { max: today } : {})}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={errors.occurredOn ? true : undefined}
        />
      </Field>
      <Field id="ed-description" label="Descrição" error={errors.description}>
        <input
          id="ed-description"
          className={inputClass}
          maxLength={100}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={errors.description ? true : undefined}
        />
      </Field>
      <Field id="ed-note" label="Observação" error={errors.note}>
        <textarea
          id="ed-note"
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
