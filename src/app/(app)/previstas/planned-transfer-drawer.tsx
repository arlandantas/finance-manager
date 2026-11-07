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
  useCreateTransferSeries,
  useUpdatePlannedTransfer,
} from "@/modules/previstas/transfer-hooks";
import {
  CreatePlannedTransferSchema,
  type PlannedTransferDTO,
} from "@/modules/previstas/transfer-schemas";
import {
  buildTransferSeriesInput,
  fieldsFromSeriesIssues,
  type TransferSeriesField,
} from "@/modules/previstas/transfer-series-form";
import { useDefaults } from "@/modules/transacoes/hooks";
import { TransferRepeatFields, useTransferRepeat } from "./transfer-repeat";

type FieldKey = TransferSeriesField | "dueOn";

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
  const rep = useTransferRepeat(defaults.data?.today);
  const monthly = !transfer && rep.repeat === "MONTHLY";
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
  const createSeries = useCreateTransferSeries(key);
  const pending = create.isPending || update.isPending || createSeries.isPending;

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
    rep.reset();
    setKey(newIdempotencyKey());
  }, [open, items, memberId, transfer, rep.reset]);

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

  function toggleRepeat(r: typeof rep.repeat) {
    rep.setRepeat(r);
    setErrors({});
    setKey(newIdempotencyKey()); // outro serviço, outra chave (a chave só se repete nos reenvios do mesmo)
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
    const built = monthly
      ? buildTransferSeriesInput({ fromId, toId, cents, description, ...rep.form })
      : null;
    if (built && !built.ok) {
      setErrors(built.errors);
      if (built.errors.amountInCents) document.getElementById("pt-amount")?.focus();
      return;
    }
    const parsed = monthly
      ? { success: true as const }
      : CreatePlannedTransferSchema.safeParse(payload);
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
        toast.success(
          transfer
            ? "Transferência prevista atualizada"
            : monthly
              ? "Transferência mensal criada"
              : "Transferência prevista",
        );
        onClose();
      },
      onError: (e: unknown) => {
        if (e instanceof ApiClientError && Array.isArray(e.details)) {
          const issues = e.details as Array<{ path: string; message: string }>;
          const next = monthly ? fieldsFromSeriesIssues(issues) : fieldsFrom(issues);
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
    } else if (built?.ok) createSeries.mutate(built.input, handlers);
    else create.mutate(payload, handlers);
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
        {monthly ? null : (
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
        )}
        {transfer ? null : (
          <TransferRepeatFields state={rep} errors={errors} onToggle={toggleRepeat} />
        )}
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
          {monthly
            ? "Cria as previsões dos próximos 12 meses. Nenhum saldo muda até você efetivar cada uma"
            : "Não muda nenhum saldo até você efetivar"}
        </p>
        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? "Salvando…"
              : monthly
                ? "Salvar transferência mensal"
                : "Salvar transferência prevista"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
