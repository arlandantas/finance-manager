"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatBRL } from "@/lib/money";
import { useAccounts } from "@/modules/contas/hooks";
import { useRegisterSettlement } from "@/modules/split/hooks";
import { CreateSettlementSchema, type SettlementSuggestion } from "@/modules/split/schemas";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey = "amountInCents" | "fromAccountId" | "toAccountId" | "occurredOn";
const first = (n: string) => n.split(" ")[0] ?? n;

export function SettleDrawer({
  period,
  suggestion,
  onClose,
}: {
  period: string;
  suggestion: SettlementSuggestion | null;
  onClose: () => void;
}) {
  const open = suggestion !== null;
  const accounts = useAccounts();
  const defaults = useDefaults(open);
  const items = accounts.data?.items ?? [];
  const [cents, setCents] = useState(0);
  const [fromAccountId, setFrom] = useState("");
  const [toAccountId, setTo] = useState("");
  const [date, setDate] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const register = useRegisterSettlement(key);
  const due = suggestion?.amountInCents ?? 0;
  const initFor = useRef<string | null>(null);

  // Valor sugerido e contas padrão (1ª do devedor/credor; senão a 1ª da família).
  useEffect(() => {
    if (!suggestion) {
      initFor.current = null;
      return;
    }
    const id = `${suggestion.from.id}:${suggestion.to.id}:${suggestion.amountInCents}`;
    if (initFor.current === id || items.length < 2) return;
    initFor.current = id;
    const from = items.find((a) => a.owner.id === suggestion.from.id) ?? items[0];
    const to =
      items.find((a) => a.owner.id === suggestion.to.id && a.id !== from?.id) ??
      items.find((a) => a.id !== from?.id);
    setFrom(from?.id ?? "");
    setTo(to?.id ?? "");
    setCents(suggestion.amountInCents);
    setDate("");
    setStep("form");
    setErrors({});
    setBanner(null);
    setKey(newIdempotencyKey());
  }, [suggestion, items]);

  function payload() {
    return {
      period,
      fromMemberId: suggestion?.from.id ?? "",
      toMemberId: suggestion?.to.id ?? "",
      amountInCents: cents,
      fromAccountId,
      toAccountId,
      ...(date ? { occurredOn: date } : {}),
    };
  }

  function review() {
    const parsed = CreateSettlementSchema.safeParse(payload());
    const next: Partial<Record<FieldKey, string>> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = i.path[0] as FieldKey;
        if (!next[k]) next[k] = i.message;
      }
    } else if (cents > due) {
      next.amountInCents = `O valor não pode ser maior que o devido (${formatBRL(due)})`;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) setStep("confirm");
  }

  function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    register.mutate(payload(), {
      onSuccess: () => {
        toast.success("Acerto registrado com sucesso!");
        onClose();
      },
      onError: (e) => {
        if (e instanceof NetworkError) setBanner(e.message);
        else if (e instanceof ApiClientError && e.code === "SETTLEMENT_EXCEEDS_DUE") {
          setErrors({ amountInCents: e.message });
          setStep("form");
        } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const from = items.find((a) => a.id === fromAccountId);
  const to = items.find((a) => a.id === toAccountId);
  const select = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    err?: string,
  ) => (
    <Field id={id} label={label} error={err}>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={err ? true : undefined}
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
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Registrar acerto"
      initialFocusId="st-amount"
    >
      {suggestion ? (
        step === "form" ? (
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              review();
            }}
          >
            <p className="text-sm text-slate-700">
              {first(suggestion.from.name)} deve {formatBRL(due)} para {first(suggestion.to.name)}.
            </p>
            <Field
              id="st-amount"
              label="Valor"
              error={errors.amountInCents}
              hint={`Máximo: ${formatBRL(due)}`}
            >
              <MoneyInput
                id="st-amount"
                large
                autoFocus
                value={cents}
                onChange={setCents}
                invalid={Boolean(errors.amountInCents)}
                describedBy={errors.amountInCents ? "st-amount-error" : undefined}
              />
            </Field>
            {select("st-from", "Conta de origem", fromAccountId, setFrom, errors.fromAccountId)}
            {select("st-to", "Conta de destino", toAccountId, setTo, errors.toAccountId)}
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
                Mais detalhes
              </summary>
              <div className="mt-3">
                <Field id="st-date" label="Data" error={errors.occurredOn}>
                  <input
                    id="st-date"
                    type="date"
                    className={inputClass}
                    value={date}
                    {...(defaults.data ? { max: defaults.data.today } : {})}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
              </div>
            </details>
            <Button type="submit" className="w-full">
              Continuar
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-5" data-testid="settle-summary">
            {banner ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {banner}
              </p>
            ) : null}
            <p className="text-base text-slate-900">
              {from?.name} → {to?.name}, <strong>{formatBRL(cents)}</strong>
            </p>
            <p className="text-sm text-slate-600">
              A transferência será registrada como Acerto de contas e abate o saldo do mês.
            </p>
            <Button className="w-full" disabled={register.isPending} onClick={confirm}>
              {register.isPending ? "Registrando…" : "Confirmar acerto"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep("form")}>
              Voltar
            </Button>
          </div>
        )
      ) : null}
    </Drawer>
  );
}
