"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { SourceSelect } from "@/components/source-select";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import {
  useCreatePlannedTransfer,
  useUpdatePlannedTransfer,
} from "@/modules/previstas/transfer-hooks";
import {
  CreatePlannedTransferSchema,
  type PlannedTransferDTO,
} from "@/modules/previstas/transfer-schemas";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey = "fromAccountId" | "toAccountId" | "amountInCents" | "dueOn" | "description";

function fieldsFrom(issues: Array<{ path: string; message: string }>) {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const i of issues) {
    const k = i.path.split(".")[0] as FieldKey;
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** US-100b: cadastro/edição de transferência prevista. Não muda nenhum saldo até efetivar. */
export function PlannedTransferDrawer({
  open,
  transfer,
  onClose,
}: {
  open: boolean;
  transfer: PlannedTransferDTO | null;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const family = useFamily();
  const defaults = useDefaults(open);
  const items = accounts.data?.items ?? [];
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [cents, setCents] = useState(0);
  const [dueOn, setDueOn] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreatePlannedTransfer(key);
  const update = useUpdatePlannedTransfer(key);
  const pending = create.isPending || update.isPending;

  // Nova abertura: estado limpo e nova chave (a chave é reaproveitada nos reenvios até o sucesso).
  const memberId = family.data?.currentMemberId;
  const today = defaults.data?.today;
  const initialized = useRef(false);
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current || items.length < 2) return;
    initialized.current = true;
    const from =
      items.find((a) => a.id === transfer?.from.id) ??
      items.find((a) => a.owner.id === memberId) ??
      items[0];
    const to = items.find((a) => a.id === transfer?.to.id) ?? items.find((a) => a.id !== from?.id);
    setFromId(from?.id ?? "");
    setToId(to?.id ?? "");
    setCents(transfer?.amountInCents ?? 0);
    setDueOn(transfer?.dueOn ?? "");
    setDescription(transfer?.description ?? "");
    setErrors({});
    setBanner(null);
    setKey(newIdempotencyKey());
  }, [open, items, memberId, transfer]);

  // a data padrão (hoje) chega depois e nunca sobrescreve o que a pessoa já digitou
  const needsDate = open && dueOn === "";
  useEffect(() => {
    if (needsDate && today) setDueOn(today);
  }, [needsDate, today]);

  const destinations = items.filter((a) => a.id !== fromId);

  function changeFrom(id: string) {
    setFromId(id);
    if (id === toId) setToId(items.find((a) => a.id !== id)?.id ?? "");
  }

  function submit() {
    if (submitting.current) return;
    const payload = {
      fromAccountId: fromId,
      toAccountId: toId,
      amountInCents: cents,
      dueOn,
      ...(description.trim() ? { description } : {}),
    };
    const parsed = CreatePlannedTransferSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldsFrom(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.amountInCents) document.getElementById("pt-amount")?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    const handlers = {
      onSuccess: () => {
        toast.success(transfer ? "Transferência prevista atualizada" : "Transferência prevista");
        onClose();
      },
      onError: (e: unknown) => {
        if (e instanceof ApiClientError && Array.isArray(e.details)) {
          const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
          setErrors(next);
          if (Object.keys(next).length === 0) setBanner(e.message);
        } else if (e instanceof NetworkError) setBanner(e.message);
        else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
      },
      onSettled: () => {
        submitting.current = false;
      },
    };
    if (transfer) {
      update.mutate(
        {
          id: transfer.id,
          input: { ...payload, description: description.trim() || null, version: transfer.version },
        },
        handlers,
      );
    } else create.mutate(payload, handlers);
  }

  const select = (
    id: string,
    label: string,
    value: string,
    list: typeof items,
    onChange: (v: string) => void,
    error?: string,
  ) => (
    <Field id={id} label={label} error={error}>
      <SourceSelect
        id={id}
        color={items.find((a) => a.id === value)?.color}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      >
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </SourceSelect>
    </Field>
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={transfer ? "Editar transferência prevista" : "Nova transferência prevista"}
      initialFocusId="pt-amount"
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
        <Field id="pt-amount" label="Valor" error={errors.amountInCents}>
          <MoneyInput
            id="pt-amount"
            large
            value={cents}
            onChange={(c) => {
              setCents(c);
              if (c > 0) setErrors((e) => ({ ...e, amountInCents: undefined }));
            }}
            invalid={Boolean(errors.amountInCents)}
            describedBy={errors.amountInCents ? "pt-amount-error" : undefined}
          />
        </Field>
        {select("pt-from", "Conta de origem", fromId, items, changeFrom, errors.fromAccountId)}
        {select("pt-to", "Conta de destino", toId, destinations, setToId, errors.toAccountId)}
        <Field id="pt-due" label="Vencimento" error={errors.dueOn}>
          <input
            id="pt-due"
            type="date"
            className={inputClass}
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            aria-invalid={errors.dueOn ? true : undefined}
          />
        </Field>
        <Field id="pt-desc" label="Descrição (opcional)" error={errors.description}>
          <input
            id="pt-desc"
            className={inputClass}
            maxLength={100}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={errors.description ? true : undefined}
          />
        </Field>
        <p
          aria-live="polite"
          data-testid="planned-transfer-effect"
          className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
        >
          Não muda nenhum saldo até você efetivar
        </p>
        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Salvar transferência prevista"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
