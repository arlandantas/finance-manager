"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatBRL } from "@/lib/money";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import { usePayPlanned, usePlanned } from "@/modules/previstas/hooks";
import { differenceLabel } from "@/modules/previstas/rules";
import { PayPlannedExpenseSchema } from "@/modules/previstas/schemas";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey = "accountId" | "amountInCents" | "paidOn" | "payerMemberId";

/** "Dar baixa em {descrição}" (US-019, SDD-009 §5). A chave de idempotência nasce a cada abertura. */
export function PayPlannedDrawer({
  plannedId,
  onClose,
}: {
  plannedId: string | null;
  onClose: () => void;
}) {
  const open = plannedId !== null;
  const detail = usePlanned(plannedId);
  const planned = detail.data?.plannedExpense ?? null;
  const accounts = useAccounts();
  const family = useFamily();
  const defaults = useDefaults(open);
  const qc = useQueryClient();
  const [cents, setCents] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const pay = usePayPlanned(key);

  // Nova abertura: estado limpo e nova chave.
  useEffect(() => {
    if (!plannedId) return;
    setErrors({});
    setBanner(null);
    setConflict(null);
    setPaidOn("");
    setDetailsOpen(false);
    setAccountId("");
    setKey(newIdempotencyKey());
  }, [plannedId]);

  // Padrões: valor = previsto; pagador = responsável; conta = a do último lançamento do membro.
  const loadedId = planned?.id;
  useEffect(() => {
    if (!planned) return;
    setCents(planned.amountInCents);
    setPayerId(planned.responsible.id);
    // biome-ignore lint/correctness/useExhaustiveDependencies: só reinicia quando a previsão carregada muda
  }, [loadedId, planned?.version]);
  useEffect(() => {
    if (open && defaults.data?.accountId)
      setAccountId((cur) => cur || (defaults.data?.accountId ?? ""));
  }, [open, defaults.data]);

  const account = (accounts.data?.items ?? []).find((a) => a.id === accountId);
  const negative = account !== undefined && account.balanceInCents - cents < 0;
  const diff = planned ? cents - planned.amountInCents : 0;

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
    else if (e instanceof ApiClientError && e.code === "PLANNED_ALREADY_PAID")
      setConflict(e.message);
    else if (e instanceof ApiClientError && Array.isArray(e.details)) {
      const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
      setErrors(next);
      if (next.paidOn) setDetailsOpen(true);
      if (Object.keys(next).length === 0) setBanner(e.message);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function submit() {
    if (!planned || submitting.current) return;
    const payload = {
      version: planned.version,
      accountId,
      amountInCents: cents,
      ...(paidOn ? { paidOn } : {}),
      ...(payerId ? { payerMemberId: payerId } : {}),
    };
    const parsed = PayPlannedExpenseSchema.safeParse(payload);
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
    pay.mutate(
      { id: planned.id, input: parsed.data },
      {
        onSuccess: () => {
          toast.success("Pagamento registrado com sucesso!");
          onClose();
        },
        onError,
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  const members = family.data?.members ?? [];

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={planned ? `Dar baixa em ${planned.description}` : "Dar baixa"}
    >
      {conflict ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflict}
          </p>
          <Button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["planned"] });
              await qc.invalidateQueries({ queryKey: ["payables"] });
              await qc.invalidateQueries({ queryKey: ["home"] });
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
      ) : !planned ? (
        <p className="text-sm text-slate-600" aria-busy="true">
          Carregando…
        </p>
      ) : (
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

          <Field
            id="pay-amount"
            label="Valor pago"
            error={errors.amountInCents}
            hint={`Previsto ${formatBRL(planned.amountInCents)}`}
          >
            <MoneyInput
              id="pay-amount"
              large
              autoFocus
              value={cents}
              onChange={setCents}
              invalid={Boolean(errors.amountInCents)}
              describedBy={errors.amountInCents ? "pay-amount-error" : undefined}
            />
          </Field>
          <p data-testid="pay-difference" className="-mt-3 text-sm font-medium text-slate-700">
            {differenceLabel(diff, formatBRL)}
          </p>

          <Field id="pay-account" label="Conta" error={errors.accountId}>
            <select
              id="pay-account"
              className={inputClass}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-invalid={errors.accountId ? true : undefined}
            >
              <option value="" disabled>
                Escolha uma conta
              </option>
              {(accounts.data?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · Saldo {formatBRL(a.balanceInCents)}
                </option>
              ))}
            </select>
          </Field>

          {negative ? (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"
            >
              A conta de origem ficará negativa
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span id="pay-payer-label" className="text-sm font-medium text-slate-800">
              Quem pagou?
            </span>
            <div
              role="radiogroup"
              aria-labelledby="pay-payer-label"
              className="flex flex-wrap gap-2"
            >
              {members.map((m) => (
                <button
                  key={m.memberId}
                  type="button"
                  role="radio"
                  aria-checked={payerId === m.memberId}
                  aria-label={m.name.split(" ")[0]}
                  onClick={() => setPayerId(m.memberId)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium",
                    payerId === m.memberId
                      ? "border-brand-700 bg-brand-50 text-brand-800"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  <Avatar name={m.name} image={m.image} size={32} />
                  {m.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          <details
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="rounded-lg border border-slate-200 p-3"
          >
            <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
              Mais detalhes
            </summary>
            <div className="mt-3">
              <Field
                id="pay-date"
                label="Data do pagamento"
                error={errors.paidOn}
                hint="Se vazia, hoje."
              >
                <input
                  id="pay-date"
                  type="date"
                  className={inputClass}
                  value={paidOn}
                  {...(defaults.data ? { max: defaults.data.today } : {})}
                  onChange={(e) => setPaidOn(e.target.value)}
                  aria-invalid={errors.paidOn ? true : undefined}
                />
              </Field>
            </div>
          </details>

          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4">
            <Button
              type="submit"
              variant={negative ? "danger" : "primary"}
              className="w-full"
              disabled={pay.isPending}
            >
              {pay.isPending
                ? "Registrando…"
                : negative
                  ? "Confirmar mesmo assim"
                  : "Confirmar pagamento"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
