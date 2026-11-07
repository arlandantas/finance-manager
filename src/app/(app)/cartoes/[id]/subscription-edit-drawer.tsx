"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  useEndSubscription,
  useSubscriptionImpact,
  useUpdateSubscription,
} from "@/modules/assinaturas/hooks";
import {
  type SubscriptionDTO,
  type UpdateSubscriptionInput,
  UpdateSubscriptionSchema,
} from "@/modules/assinaturas/schemas";
import { useCategories } from "@/modules/categorias/hooks";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";
import { addMonths, type MonthISO, monthOf } from "@/modules/previstas/recurrence";
import { useDefaults } from "@/modules/transacoes/hooks";
import { monthLabel } from "../../extrato/filters";
import { useOnline } from "./subscription-drawer";
import { SubscriptionShareSwitch } from "./subscription-share-switch";

type FieldKey = "description" | "amountInCents" | "categoryId";
const errMsg = (e: unknown) =>
  e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";

/** Editar, reajustar e encerrar a assinatura (US-097, spec 12). Dia e cartão não mudam. */
export function SubscriptionEditDrawer({
  sub,
  onClose,
}: {
  sub: SubscriptionDTO | null;
  onClose: () => void;
}) {
  const family = useFamily();
  const categories = useCategories("EXPENSE");
  const online = useOnline();
  const defaults = useDefaults(sub !== null);
  const splitAvailable = defaults.data?.split.available ?? false;
  const [key, setKey] = useState(newIdempotencyKey);
  const [endKey, setEndKey] = useState(newIdempotencyKey);
  const update = useUpdateSubscription(sub?.id ?? "", key);
  const endIt = useEndSubscription(sub?.id ?? "", endKey);
  const busy = useRef(false);
  const [description, setDescription] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [shared, setShared] = useState(false);
  const [from, setFrom] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const subId = sub?.id;

  useEffect(() => {
    if (!sub) return;
    setKey(newIdempotencyKey());
    setEndKey(newIdempotencyKey());
    setDescription(sub.description);
    setCents(sub.currentAmountInCents);
    setCategoryId(sub.category.id);
    setPayerId(sub.payer.id);
    setShared(sub.isSharedExpense);
    setFrom(sub.nextChargeOn ? monthOf(sub.nextChargeOn) : "");
    setConfirmEnd(false);
    setErrors({});
    setBanner(null);
  }, [subId]);

  const nextMonth = sub?.nextChargeOn ? (monthOf(sub.nextChargeOn) as MonthISO) : null;
  const months = nextMonth ? Array.from({ length: 12 }, (_, i) => addMonths(nextMonth, i)) : [];
  const amountChanged = sub !== null && cents !== sub.currentAmountInCents;
  const impact = useSubscriptionImpact(amountChanged && sub ? sub.id : null, from || null);
  const me = family.data?.currentMemberId ?? "";

  function fail(err: unknown) {
    if (err instanceof ApiClientError && Array.isArray(err.details)) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const d of err.details as Array<{ path: string; message: string }>) {
        if (["description", "categoryId"].includes(d.path)) next[d.path as FieldKey] = d.message;
        if (d.path === "effectiveFromMonth") next.amountInCents = d.message;
      }
      setErrors(next);
    }
    setBanner(errMsg(err));
    // a mesma chave não pode carregar outro corpo: nova tentativa, nova chave
    setKey(newIdempotencyKey());
    setEndKey(newIdempotencyKey());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sub || busy.current || !online) return;
    const body: UpdateSubscriptionInput = { version: sub.version };
    if (description !== sub.description) body.description = description;
    if (categoryId !== sub.category.id) body.categoryId = categoryId;
    if (payerId !== sub.payer.id) body.payerMemberId = payerId;
    if (shared !== sub.isSharedExpense) body.isSharedExpense = shared;
    if (amountChanged) {
      body.amountInCents = cents;
      if (from) body.effectiveFromMonth = from;
    }
    const parsed = UpdateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] === "effectiveFromMonth" ? "amountInCents" : issue.path[0];
        next[k as FieldKey] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBanner(null);
    busy.current = true;
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success("Assinatura atualizada");
        onClose();
      },
      onError: fail,
      onSettled: () => {
        busy.current = false;
      },
    });
  }

  function confirmEndNow() {
    if (!sub || busy.current || !online) return;
    busy.current = true;
    setBanner(null);
    endIt.mutate(sub.version, {
      onSuccess: () => {
        toast.success("Assinatura encerrada");
        onClose();
      },
      onError: (err) => {
        setConfirmEnd(false);
        fail(err);
      },
      onSettled: () => {
        busy.current = false;
      },
    });
  }

  const n = impact.data?.impact;
  return (
    <Drawer
      open={sub !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Editar assinatura"
      description={sub ? `No cartão ${sub.card.name}, todo dia ${sub.dayOfMonth}` : ""}
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
        <Field id="sube-description" label="Descrição" error={errors.description}>
          <TextInput
            id="sube-description"
            autoComplete="off"
            value={description}
            aria-invalid={errors.description ? true : undefined}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field id="sube-amount" label="Valor" error={errors.amountInCents}>
          <MoneyInput
            id="sube-amount"
            value={cents}
            onChange={setCents}
            invalid={Boolean(errors.amountInCents)}
          />
        </Field>
        {amountChanged && months.length > 0 ? (
          <Field id="sube-from" label="A partir de">
            <select
              id="sube-from"
              className={inputClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {amountChanged && n ? (
          <p data-testid="subscription-impact" className="text-sm text-slate-700">
            {n.affectedCount === null
              ? "Muda as próximas cobranças"
              : `Muda ${n.affectedCount} ${n.affectedCount === 1 ? "próxima cobrança" : "próximas cobranças"}`}
            ; {n.keptPostedCount} já {n.keptPostedCount === 1 ? "lançada fica" : "lançadas ficam"}
          </p>
        ) : null}
        <Field id="sube-category" label="Categoria" error={errors.categoryId}>
          <select
            id="sube-category"
            className={inputClass}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {(categories.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sube-payer" label="Quem gastou">
          <select
            id="sube-payer"
            className={inputClass}
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
          >
            {(family.data?.members ?? []).map((m) => (
              <option
                key={m.memberId}
                value={m.memberId}
                // spec 01: ninguém age em nome de outro (exceção: Admin p/ dono sem conta)
                disabled={
                  m.memberId !== me &&
                  m.memberId !== sub?.payer.id &&
                  !(family.data?.currentRole === "ADMIN" && m.unlinked)
                }
              >
                {memberOptionLabel({ name: m.name.split(" ")[0] as string, unlinked: m.unlinked })}
              </option>
            ))}
          </select>
        </Field>
        {splitAvailable || sub?.isSharedExpense ? (
          <SubscriptionShareSwitch
            shared={shared}
            onChange={setShared}
            ruleShares={defaults.data?.split.ruleShares}
            notice="Vale a partir da próxima cobrança"
          />
        ) : null}
        <Button type="submit" disabled={update.isPending || endIt.isPending || !online}>
          {update.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
        {confirmEnd ? (
          <div
            role="alertdialog"
            aria-label="Encerrar assinatura"
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
          >
            <p className="text-sm text-slate-800">As cobranças já lançadas ficam no Extrato.</p>
            <Button
              type="button"
              variant="danger"
              disabled={endIt.isPending || !online}
              onClick={confirmEndNow}
            >
              {endIt.isPending ? "Encerrando…" : "Confirmar encerramento"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmEnd(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="button" variant="danger" onClick={() => setConfirmEnd(true)}>
            Encerrar assinatura
          </Button>
        )}
      </form>
    </Drawer>
  );
}
