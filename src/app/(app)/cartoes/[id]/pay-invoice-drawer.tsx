"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Money, useFormatMoney } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { usePayInvoice } from "@/modules/cartoes/hooks";
import { type InvoiceDTO, PayInvoiceSchema } from "@/modules/cartoes/schemas";
import { useAccounts } from "@/modules/contas/hooks";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey = "accountId" | "paidOn" | "expectedTotalInCents";

/** "Pagar fatura {Cartão} {mês}" (US-017b): valor somente leitura, conta com saldo, data em Mais detalhes. */
export function PayInvoiceDrawer({
  open,
  cardName,
  invoice,
  onClose,
}: {
  open: boolean;
  cardName: string;
  invoice: InvoiceDTO;
  onClose: () => void;
}) {
  const fmt = useFormatMoney();
  const accounts = useAccounts();
  const defaults = useDefaults(open);
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [expected, setExpected] = useState(invoice.totalInCents);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const pay = usePayInvoice(invoice.cardId, invoice.ref, key);

  useEffect(() => {
    if (!open) return;
    setAccountId("");
    setPaidOn("");
    setErrors({});
    setBanner(null);
    setInfo(null);
    setDetailsOpen(false);
    setExpected(invoice.totalInCents);
    setKey(newIdempotencyKey());
  }, [open]);
  useEffect(() => {
    if (open && defaults.data?.accountId) {
      setAccountId((cur) => cur || (defaults.data?.accountId ?? ""));
    }
  }, [open, defaults.data]);

  const account = (accounts.data?.items ?? []).find((a) => a.id === accountId);
  const negative = account !== undefined && account.balanceInCents - expected < 0;

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
    else if (e instanceof ApiClientError && e.code === "INVOICE_TOTAL_CHANGED") {
      // Recarrega o total (nova chave, novo expectedTotalInCents) e orienta a conferir.
      const current = (e.details as { currentTotalInCents?: number } | undefined)
        ?.currentTotalInCents;
      if (typeof current === "number") setExpected(current);
      setKey(newIdempotencyKey());
      setInfo(e.message);
      void qc.invalidateQueries({ queryKey: ["invoice"] });
      void qc.invalidateQueries({ queryKey: ["cards"] });
    } else if (e instanceof ApiClientError && e.code === "INVOICE_ALREADY_PAID") {
      setBanner(e.message);
      void qc.invalidateQueries({ queryKey: ["invoice"] });
    } else if (e instanceof ApiClientError && Array.isArray(e.details)) {
      const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
      setErrors(next);
      if (next.paidOn) setDetailsOpen(true);
      if (Object.keys(next).length === 0) setBanner(e.message);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function submit() {
    if (submitting.current) return;
    const parsed = PayInvoiceSchema.safeParse({
      accountId,
      expectedTotalInCents: expected,
      ...(paidOn ? { paidOn } : {}),
    });
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
    setInfo(null);
    submitting.current = true;
    pay.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Fatura paga com sucesso!");
        onClose();
      },
      onError,
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const min = invoice.closingDate;
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Pagar fatura ${cardName} ${formatInvoiceLabel(invoice.ref)}`}
    >
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
        {info ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            {info}
          </p>
        ) : null}

        <div>
          <p className="text-sm text-slate-600">Valor da fatura</p>
          <p
            data-testid="pay-invoice-total"
            className="text-3xl font-bold tabular-nums text-slate-900"
          >
            <Money cents={expected} />
          </p>
          <p className="text-xs text-slate-500">O pagamento é sempre do valor total.</p>
        </div>

        <Field id="pi-account" label="Conta de origem" error={errors.accountId}>
          <select
            id="pi-account"
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
                {a.name} · Saldo {fmt(a.balanceInCents)}
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
              id="pi-date"
              label="Data do pagamento"
              error={errors.paidOn}
              hint="Se vazia, hoje. Depois do fechamento e até hoje."
            >
              <input
                id="pi-date"
                type="date"
                className={inputClass}
                min={min}
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
    </Drawer>
  );
}
