"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatBRL } from "@/lib/money";
import { useAccounts, useCreateTransfer } from "@/modules/contas/hooks";
import { CreateTransferSchema } from "@/modules/contas/schemas";
import { transferPreview } from "@/modules/contas/transfer-preview";
import { useFamily } from "@/modules/familia/hooks";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey = "fromAccountId" | "toAccountId" | "amountInCents" | "occurredOn" | "note";

export function TransferDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const accounts = useAccounts();
  const family = useFamily();
  const defaults = useDefaults(open);
  const items = accounts.data?.items ?? [];
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [cents, setCents] = useState(0);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // ADR-009: a chave nasce ao abrir o drawer e é reaproveitada nos reenvios até o sucesso.
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreateTransfer(key);

  // Nova abertura: estado limpo, nova chave e contas padrão (origem: do membro logado; destino: outra).
  const currentMemberId = family.data?.currentMemberId;
  const initialized = useRef(false);
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current || items.length < 2) return;
    initialized.current = true;
    const from = items.find((a) => a.owner.id === currentMemberId) ?? items[0];
    const to = items.find((a) => a.id !== from?.id);
    setFromId(from?.id ?? "");
    setToId(to?.id ?? "");
    setCents(0);
    setDate("");
    setNote("");
    setErrors({});
    setBanner(null);
    setDetailsOpen(false);
    setKey(newIdempotencyKey());
  }, [open, items, currentMemberId]);

  const from = items.find((a) => a.id === fromId);
  const to = items.find((a) => a.id === toId);
  const preview =
    from && to && cents > 0
      ? transferPreview({ from: from.balanceInCents, to: to.balanceInCents }, cents)
      : null;
  const negative = preview?.fromNegative ?? false;

  function payload() {
    return {
      fromAccountId: fromId,
      toAccountId: toId,
      amountInCents: cents,
      ...(date ? { occurredOn: date } : {}),
      ...(note.trim() ? { note } : {}),
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

  function submit() {
    if (submitting.current) return;
    const parsed = CreateTransferSchema.safeParse(payload());
    if (!parsed.success) {
      const next = fieldsFrom(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.amountInCents) document.getElementById("tf-amount")?.focus();
      if (next.occurredOn || next.note) setDetailsOpen(true);
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    create.mutate(payload(), {
      onSuccess: () => {
        toast.success("Transferência registrada com sucesso!");
        onOpenChange(false);
      },
      onError: (e) => {
        if (e instanceof NetworkError) setBanner(e.message);
        else if (e instanceof ApiClientError && Array.isArray(e.details)) {
          const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
          setErrors(next);
          if (next.occurredOn) setDetailsOpen(true);
          if (Object.keys(next).length === 0) setBanner(e.message);
        } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const accountSelect = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    error?: string,
  ) => (
    <Field id={id} label={label} error={error}>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      >
        {items.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Transferir" initialFocusId="tf-amount">
      <form
        noValidate
        className="flex flex-col gap-5"
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

        <Field id="tf-amount" label="Valor" error={errors.amountInCents}>
          <MoneyInput
            id="tf-amount"
            large
            autoFocus
            value={cents}
            onChange={setCents}
            invalid={Boolean(errors.amountInCents)}
            describedBy={errors.amountInCents ? "tf-amount-error" : undefined}
          />
        </Field>

        {accountSelect("tf-from", "Conta de origem", fromId, setFromId, errors.fromAccountId)}
        {accountSelect("tf-to", "Conta de destino", toId, setToId, errors.toAccountId)}

        {preview && from && to ? (
          <section
            aria-label="Saldos após a transferência"
            data-testid="transfer-preview"
            className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
          >
            <p>
              {from.name} ficará com{" "}
              <strong className={cn("tabular-nums", preview.from < 0 && "text-red-700")}>
                {formatBRL(preview.from)}
              </strong>
            </p>
            <p>
              {to.name} ficará com <strong className="tabular-nums">{formatBRL(preview.to)}</strong>
            </p>
          </section>
        ) : null}

        {negative ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            A conta de origem ficará negativa
          </p>
        ) : null}

        <details
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="rounded-lg border border-slate-200 p-3"
        >
          <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
            Mais detalhes
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <Field id="tf-date" label="Data" error={errors.occurredOn}>
              <input
                id="tf-date"
                type="date"
                className={inputClass}
                value={date}
                {...(defaults.data ? { max: defaults.data.today } : {})}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.occurredOn ? true : undefined}
              />
            </Field>
            <Field id="tf-note" label="Observação" error={errors.note}>
              <textarea
                id="tf-note"
                className={cn(inputClass, "min-h-20 py-2")}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </details>

        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4">
          <Button
            type="submit"
            variant={negative ? "danger" : "primary"}
            className="w-full"
            disabled={create.isPending}
          >
            {create.isPending
              ? "Transferindo…"
              : negative
                ? "Confirmar mesmo assim"
                : "Confirmar transferência"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
