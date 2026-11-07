"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAccounts } from "@/modules/contas/hooks";
import { transferPreview } from "@/modules/contas/transfer-preview";
import { useRealizePlannedTransfer } from "@/modules/previstas/transfer-hooks";
import type { PlannedTransferDTO } from "@/modules/previstas/transfer-schemas";
import { useDefaults } from "@/modules/transacoes/hooks";

/** US-100b: efetivar = transferência real (valor padrão o previsto, data padrão hoje, máx. hoje). */
export function RealizeTransferDrawer({
  transfer,
  onClose,
}: {
  transfer: PlannedTransferDTO | null;
  onClose: () => void;
}) {
  const open = transfer !== null;
  const defaults = useDefaults(open);
  const accounts = useAccounts();
  const [cents, setCents] = useState(0);
  const [date, setDate] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const realize = useRealizePlannedTransfer(key);
  const today = defaults.data?.today;

  const id = transfer?.id;
  const initial = transfer?.amountInCents;
  useEffect(() => {
    if (id === undefined || initial === undefined) return;
    setCents(initial);
    setDate("");
    setBanner(null);
    setError(null);
    setKey(newIdempotencyKey());
  }, [id, initial]);

  const from = accounts.data?.items.find((a) => a.id === transfer?.from.id);
  const to = accounts.data?.items.find((a) => a.id === transfer?.to.id);
  const negative =
    from && to && cents > 0
      ? transferPreview({ from: from.balanceInCents, to: to.balanceInCents }, cents).fromNegative
      : false;

  function submit() {
    if (!transfer || submitting.current) return;
    if (cents <= 0) {
      setError("Informe um valor maior que zero");
      return;
    }
    const day = date || today;
    if (today && day && day > today) {
      setError("A data não pode ser futura");
      return;
    }
    setError(null);
    setBanner(null);
    submitting.current = true;
    realize.mutate(
      {
        id: transfer.id,
        input: {
          version: transfer.version,
          amountInCents: cents,
          ...(day ? { occurredOn: day } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success("Transferência efetivada");
          onClose();
        },
        onError: (e) => {
          if (e instanceof NetworkError || e instanceof ApiClientError) setBanner(e.message);
          else setBanner("Erro inesperado. Tente novamente.");
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
      onOpenChange={(o) => !o && onClose()}
      title="Efetivar transferência"
      initialFocusId="rt-amount"
    >
      <form
        noValidate
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {transfer ? (
          <p className="text-sm text-slate-700">
            {transfer.from.name} → {transfer.to.name}
          </p>
        ) : null}
        {banner ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {banner}
          </p>
        ) : null}
        <Field id="rt-amount" label="Valor" error={error ?? undefined}>
          <MoneyInput
            id="rt-amount"
            large
            value={cents}
            onChange={(c) => {
              setCents(c);
              setError(null);
            }}
            invalid={Boolean(error)}
            describedBy={error ? "rt-amount-error" : undefined}
          />
        </Field>
        <Field id="rt-date" label="Data da transferência">
          <input
            id="rt-date"
            type="date"
            className={inputClass}
            value={date || today || ""}
            {...(today ? { max: today } : {})}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {negative ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
          >
            A conta de origem ficará negativa
          </p>
        ) : null}
        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
          <Button
            type="submit"
            variant={negative ? "danger" : "primary"}
            className="w-full"
            disabled={realize.isPending}
          >
            {realize.isPending ? "Efetivando…" : negative ? "Efetivar mesmo assim" : "Efetivar"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
