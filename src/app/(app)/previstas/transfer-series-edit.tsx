"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { SourceSelect } from "@/components/source-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAccounts } from "@/modules/contas/hooks";
import {
  useTransferSeries,
  useTransferSeriesImpact,
  useUpdateTransferSeries,
} from "@/modules/previstas/transfer-hooks";
import {
  buildTransferSeriesPatch,
  fieldsFromSeriesIssues,
  seriesImpactText,
  type TransferSeriesField,
} from "@/modules/previstas/transfer-series-form";
import { useDefaults } from "@/modules/transacoes/hooks";

export const SERIES_ENDED_MSG = "Esta transferência mensal já foi encerrada";

/** US-101b: "Editar série" vale do mês atual em diante; mostra o impacto ANTES de salvar. */
export function TransferSeriesEditDrawer({
  seriesId,
  onClose,
}: {
  seriesId: string | null;
  onClose: () => void;
}) {
  const open = seriesId !== null;
  const today = useDefaults(open).data?.today;
  const series = useTransferSeries(seriesId);
  const impact = useTransferSeriesImpact(seriesId, today?.slice(0, 7));
  const accounts = useAccounts();
  const items = accounts.data?.items ?? [];
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [cents, setCents] = useState(0);
  const [description, setDescription] = useState("");
  const [day, setDay] = useState("");
  const [endKind, setEndKind] = useState<"NONE" | "COUNT">("NONE");
  const [endMonths, setEndMonths] = useState("");
  const [errors, setErrors] = useState<Partial<Record<TransferSeriesField, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const loaded = useRef<string | null>(null);
  const submitting = useRef(false);
  const update = useUpdateTransferSeries(key);
  const s = series.data?.series;

  // carrega o formulário uma vez por (série, versão): recarregar após conflito traz a versão nova
  const stamp = s ? `${s.id}:${s.version}` : null;
  useEffect(() => {
    if (!open) loaded.current = null;
    if (!s || !stamp || loaded.current === stamp) return;
    loaded.current = stamp;
    setFromId(s.from.id);
    setToId(s.to.id);
    setCents(s.amountInCents);
    setDescription(s.description ?? "");
    setDay(String(s.dayOfMonth));
    const count = s.endMonth ? monthsBetween(s.startMonth, s.endMonth) : 0;
    setEndKind(count > 0 ? "COUNT" : "NONE");
    setEndMonths(count > 0 ? String(count) : "");
    setErrors({});
    setBanner(null);
    setKey(newIdempotencyKey());
  }, [open, s, stamp]);

  const ended = Boolean(s?.endedAt);

  function submit() {
    if (!s || ended || submitting.current) return;
    const built = buildTransferSeriesPatch(
      { fromId, toId, cents, description, day, startMonth: s.startMonth, endKind, endMonths },
      s.version,
    );
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    update.mutate(
      { id: s.id, input: built.input },
      {
        onSuccess: () => {
          toast.success("Transferência mensal atualizada");
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiClientError && Array.isArray(e.details)) {
            const next = fieldsFromSeriesIssues(
              e.details as Array<{ path: string; message: string }>,
            );
            setErrors(next);
            if (Object.keys(next).length === 0) setBanner(e.message);
          } else if (e instanceof ApiClientError || e instanceof NetworkError) setBanner(e.message);
          else setBanner("Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  const account = (id: string, label: string, value: string, set: (v: string) => void) => (
    <Field id={id} label={label} error={id === "ts-to" ? errors.toAccountId : errors.fromAccountId}>
      <SourceSelect
        id={id}
        color={items.find((a) => a.id === value)?.color}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        {items
          .filter((a) => id === "ts-from" || a.id !== fromId)
          .map((a) => (
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
      title="Editar transferência mensal"
      initialFocusId="ts-amount"
    >
      <form
        noValidate
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {series.isPending ? <p className="text-sm text-slate-600">Carregando…</p> : null}
        {series.isError ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-300">
            Não foi possível carregar a série
          </p>
        ) : null}
        {ended ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-300">
            {SERIES_ENDED_MSG}
          </p>
        ) : null}
        {banner ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            <p>{banner}</p>
            <Button type="button" variant="secondary" onClick={() => series.refetch()}>
              Recarregar
            </Button>
          </div>
        ) : null}
        {s && !ended ? (
          <>
            <p
              aria-live="polite"
              data-testid="transfer-series-impact"
              className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
            >
              {impact.isPending
                ? "Calculando o impacto…"
                : impact.data
                  ? seriesImpactText(impact.data.impact)
                  : "Não foi possível calcular o impacto."}
            </p>
            <Field id="ts-amount" label="Valor" error={errors.amountInCents}>
              <MoneyInput id="ts-amount" large value={cents} onChange={setCents} />
            </Field>
            {account("ts-from", "Conta de origem", fromId, (v) => {
              setFromId(v);
              if (v === toId) setToId(items.find((a) => a.id !== v)?.id ?? "");
            })}
            {account("ts-to", "Conta de destino", toId, setToId)}
            <Field id="ts-day" label="Dia do mês" error={errors.day}>
              <input
                id="ts-day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                className={inputClass}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                aria-invalid={errors.day ? true : undefined}
              />
            </Field>
            <Field id="ts-desc" label="Descrição (opcional)" error={errors.description}>
              <input
                id="ts-desc"
                className={inputClass}
                maxLength={100}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span id="ts-end-label" className="text-sm font-medium text-slate-800">
                Termina
              </span>
              <div
                role="radiogroup"
                aria-labelledby="ts-end-label"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    ["NONE", "Sem fim"],
                    ["COUNT", "Depois de N meses"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={endKind === k}
                    onClick={() => setEndKind(k)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium",
                      endKind === k
                        ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-700 dark:bg-slate-100",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {endKind === "COUNT" ? (
              <Field id="ts-end-months" label="Quantos meses no total" error={errors.end}>
                <input
                  id="ts-end-months"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  className={inputClass}
                  value={endMonths}
                  onChange={(e) => setEndMonths(e.target.value)}
                  aria-invalid={errors.end ? true : undefined}
                />
              </Field>
            ) : null}
            <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4 dark:bg-slate-100">
              <Button type="submit" className="w-full" disabled={update.isPending}>
                {update.isPending ? "Salvando…" : "Salvar série"}
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </Drawer>
  );
}

/** Meses no total de `YYYY-MM` a `YYYY-MM` (inclusivo), como o servidor conta o fim. */
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return ((ey ?? 0) - (sy ?? 0)) * 12 + ((em ?? 0) - (sm ?? 0)) + 1;
}
