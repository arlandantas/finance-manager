"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateSubscription } from "@/modules/assinaturas/hooks";
import { firstChargeOn } from "@/modules/assinaturas/schedule";
import { CreateSubscriptionSchema } from "@/modules/assinaturas/schemas";
import { formatInvoiceLabel, invoiceRefFor } from "@/modules/cartoes/cycle";
import { useCategories } from "@/modules/categorias/hooks";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";
import { addMonths, type MonthISO, monthOf } from "@/modules/previstas/recurrence";
import { useDefaults } from "@/modules/transacoes/hooks";
import { monthLabel } from "../../extrato/filters";

type FieldKey = "description" | "amountInCents" | "categoryId" | "dayOfMonth" | "end";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Nova assinatura no cartão (US-096c, spec 12). Nasce "Só meu"; o interruptor de divisão vem na US-099. */
export function SubscriptionDrawer({
  open,
  card,
  onClose,
}: {
  open: boolean;
  card: { id: string; name: string; closingDay: number };
  onClose: () => void;
}) {
  const family = useFamily();
  const categories = useCategories("EXPENSE");
  const defaults = useDefaults(open);
  const today = defaults.data?.today;
  const online = useOnline();
  const [key, setKey] = useState(newIdempotencyKey);
  const create = useCreateSubscription(key);
  const submitting = useRef(false);
  const [description, setDescription] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [day, setDay] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endKind, setEndKind] = useState<"NONE" | "COUNT">("NONE");
  const [endCount, setEndCount] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(newIdempotencyKey());
    setDescription("");
    setCents(0);
    setCategoryId("");
    setDay("");
    setStartMonth("");
    setEndKind("NONE");
    setEndCount("");
    setErrors({});
    setBanner(null);
  }, [open]);

  const me = family.data?.currentMemberId ?? "";
  const payer = payerId || me;
  const currentMonth = today ? monthOf(today) : null;
  const start = (startMonth || currentMonth) as MonthISO | null;
  const dayNum = Number(day);
  const dayOk = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31;
  let effect: string | null = null;
  if (today && start && dayOk) {
    const first = firstChargeOn(start, dayNum, today);
    const ref = invoiceRefFor(first, card.closingDay);
    effect = `Primeira cobrança em ${brDate(first)}, na fatura de ${formatInvoiceLabel(ref)}`;
  }
  const months = currentMonth
    ? Array.from({ length: 12 }, (_, i) => addMonths(currentMonth as MonthISO, i))
    : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || !online) return;
    const parsed = CreateSubscriptionSchema.safeParse({
      cardId: card.id,
      description,
      amountInCents: cents,
      categoryId: categoryId || undefined,
      ...(payer ? { payerMemberId: payer } : {}),
      dayOfMonth: day === "" ? undefined : dayNum,
      ...(start ? { startMonth: start } : {}),
      end: endKind === "NONE" ? { type: "NONE" } : { type: "COUNT", count: Number(endCount) },
    });
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = (issue.path[0] === "end" ? "end" : issue.path[0]) as FieldKey;
        next[k] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Assinatura cadastrada");
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiClientError && Array.isArray(err.details)) {
          const next: Partial<Record<FieldKey, string>> = {};
          for (const d of err.details as Array<{ path: string; message: string }>) {
            if (["description", "amountInCents", "categoryId", "dayOfMonth"].includes(d.path))
              next[d.path as FieldKey] = d.message;
          }
          setErrors(next);
        }
        setBanner(
          err instanceof ApiClientError || err instanceof NetworkError
            ? err.message
            : "Erro inesperado. Tente novamente.",
        );
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Nova assinatura"
      description={`No cartão ${card.name}`}
    >
      <form onSubmit={submit} noValidate className="form-stack overflow-y-auto p-4">
        {banner ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {banner}
          </p>
        ) : null}
        {online ? null : (
          <p role="status" className="text-sm text-amber-900 dark:text-amber-200">
            Sem conexão. Conecte-se para salvar.
          </p>
        )}
        <Field id="sub-description" label="Descrição" error={errors.description}>
          <TextInput
            id="sub-description"
            autoComplete="off"
            placeholder="Ex.: Netflix"
            value={description}
            aria-invalid={errors.description ? true : undefined}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field id="sub-amount" label="Valor" error={errors.amountInCents}>
          <MoneyInput
            id="sub-amount"
            value={cents}
            onChange={setCents}
            invalid={Boolean(errors.amountInCents)}
          />
        </Field>
        <Field id="sub-category" label="Categoria" error={errors.categoryId}>
          <select
            id="sub-category"
            className={inputClass}
            value={categoryId}
            aria-invalid={errors.categoryId ? true : undefined}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {(categories.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="sub-day"
          label="Dia da cobrança"
          error={errors.dayOfMonth}
          hint="29 a 31 caem no último dia em meses curtos"
        >
          <TextInput
            id="sub-day"
            inputMode="numeric"
            value={day}
            aria-invalid={errors.dayOfMonth ? true : undefined}
            onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </Field>
        <Field id="sub-start" label="Começa em">
          <select
            id="sub-start"
            className={inputClass}
            value={start ?? ""}
            onChange={(e) => setStartMonth(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sub-end" label="Termina" error={errors.end}>
          <select
            id="sub-end"
            className={inputClass}
            value={endKind}
            onChange={(e) => setEndKind(e.target.value as "NONE" | "COUNT")}
          >
            <option value="NONE">Sem fim</option>
            <option value="COUNT">Após N cobranças</option>
          </select>
        </Field>
        {endKind === "COUNT" ? (
          <Field id="sub-count" label="Número de cobranças">
            <TextInput
              id="sub-count"
              inputMode="numeric"
              value={endCount}
              onChange={(e) => setEndCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </Field>
        ) : null}
        <Field id="sub-payer" label="Quem gastou">
          <select
            id="sub-payer"
            className={inputClass}
            value={payer}
            onChange={(e) => setPayerId(e.target.value)}
          >
            {(family.data?.members ?? []).map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {memberOptionLabel({ name: m.name.split(" ")[0] as string, unlinked: m.unlinked })}
              </option>
            ))}
          </select>
        </Field>
        {effect ? (
          <p data-testid="subscription-effect" className="text-sm text-slate-700">
            {effect}
          </p>
        ) : null}
        <Button type="submit" disabled={create.isPending || !online}>
          {create.isPending ? "Salvando…" : "Salvar assinatura"}
        </Button>
      </form>
    </Drawer>
  );
}
