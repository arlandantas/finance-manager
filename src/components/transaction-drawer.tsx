"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { useFormatMoney } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { invoiceHint } from "@/modules/cartoes/cycle";
import { useCards } from "@/modules/cartoes/hooks";
import { useCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import { splitSwitchLabel } from "@/modules/split/shares-label";
import { useCreateTransaction, useDefaults } from "@/modules/transacoes/hooks";
import {
  type CreateTransactionInput,
  CreateTransactionSchema,
  DESCRIPTION_MSG,
} from "@/modules/transacoes/schemas";

type Kind = "EXPENSE" | "INCOME";
type FieldKey =
  | "amountInCents"
  | "accountId"
  | "cardId"
  | "categoryId"
  | "occurredOn"
  | "description"
  | "note"
  | "payerMemberId";

const TEXT: Record<Kind, { title: string; payer: string; save: string; success: string }> = {
  EXPENSE: {
    title: "Nova Despesa",
    payer: "Quem pagou?",
    save: "Salvar Despesa",
    success: "Despesa registrada com sucesso!",
  },
  INCOME: {
    title: "Nova Receita",
    payer: "Quem recebeu?",
    save: "Salvar Receita",
    success: "Receita registrada com sucesso!",
  },
};

export function TransactionDrawer({
  open,
  onOpenChange,
  initialKind = "EXPENSE",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: Kind;
}) {
  const fmt = useFormatMoney();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [cents, setCents] = useState(0);
  // "Pagar com": `accountId` ou `cardId` (um dos dois), guardados juntos como "acc:<id>" / "card:<id>".
  const [source, setSource] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [shared, setShared] = useState(false); // nasce "Só meu" e não lembra a escolha (US-030)
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // ADR-009: a chave nasce ao abrir o drawer e é reaproveitada nos reenvios até o sucesso.
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  const defaults = useDefaults(open);
  const splitAvailable = defaults.data?.split.available ?? false;
  const accounts = useAccounts();
  const cards = useCards();
  const family = useFamily();
  const categories = useCategories(kind);
  const create = useCreateTransaction(key);

  // Nova abertura: estado limpo e nova chave.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setCents(0);
    setCategoryId("");
    setShared(false);
    setDate("");
    setDescription("");
    setNote("");
    setErrors({});
    setBanner(null);
    setDetailsOpen(false);
    setSource("");
    setPayerId("");
    setKey(newIdempotencyKey());
  }, [open, initialKind]);

  // Padrões vindos do servidor (última conta usada; quem pagou = logado).
  useEffect(() => {
    if (!open || !defaults.data) return;
    // Padrão: último meio usado (cartão da despesa mais recente, senão a conta).
    setSource((cur) => {
      if (cur) return cur;
      if (defaults.data.cardId) return `card:${defaults.data.cardId}`;
      return defaults.data.accountId ? `acc:${defaults.data.accountId}` : "";
    });
    setPayerId((cur) => cur || defaults.data.payerMemberId);
  }, [open, defaults.data]);

  const cardList = cards.data?.items ?? [];
  const selectedCard = source.startsWith("card:")
    ? cardList.find((c) => `card:${c.id}` === source)
    : undefined;
  // Receita só entra em conta: se o padrão veio como cartão, volta para a primeira conta.
  const effectiveSource = kind === "INCOME" && source.startsWith("card:") ? "" : source;

  function switchKind(next: Kind) {
    if (next === kind) return;
    setKind(next);
    if (next === "INCOME" && source.startsWith("card:")) {
      setSource(defaults.data?.accountId ? `acc:${defaults.data.accountId}` : "");
    }
    setCategoryId("");
    setErrors((e) => ({ ...e, categoryId: undefined }));
  }

  function buildPayload(): CreateTransactionInput {
    const fromCard = kind === "EXPENSE" && effectiveSource.startsWith("card:");
    return {
      type: kind,
      ...(fromCard
        ? { cardId: effectiveSource.slice(5) }
        : { accountId: effectiveSource.startsWith("acc:") ? effectiveSource.slice(4) : "" }),
      categoryId,
      amountInCents: cents,
      ...(payerId ? { payerMemberId: payerId } : {}),
      ...(date ? { occurredOn: date } : {}),
      ...(description.trim() ? { description } : {}),
      ...(note.trim() ? { note } : {}),
      ...(kind === "EXPENSE" ? { isSharedExpense: splitAvailable && shared } : {}),
    } as CreateTransactionInput;
  }

  function fieldsFromIssues(issues: Array<{ path: string; message: string }>) {
    const out: Partial<Record<FieldKey, string>> = {};
    for (const i of issues) {
      const k = i.path.split(".")[0] as FieldKey;
      if (!out[k]) out[k] = i.message;
    }
    return out;
  }

  function submit() {
    if (submitting.current) return;
    const parsed = CreateTransactionSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const next = fieldsFromIssues(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.occurredOn || next.note) setDetailsOpen(true);
      if (next.amountInCents) document.getElementById("tx-amount")?.focus();
      else if (next.categoryId) categoryRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    create.mutate(buildPayload(), {
      onSuccess: () => {
        toast.success(TEXT[kind].success);
        onOpenChange(false);
      },
      onError: (e) => {
        if (e instanceof NetworkError) setBanner(e.message);
        else if (e instanceof ApiClientError && Array.isArray(e.details)) {
          const next = fieldsFromIssues(e.details as Array<{ path: string; message: string }>);
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

  const trimmedDescription = description.trim();
  const liveDescriptionError =
    trimmedDescription !== "" && (trimmedDescription.length < 2 || trimmedDescription.length > 100)
      ? DESCRIPTION_MSG
      : undefined;
  const text = TEXT[kind];
  const members = family.data?.members ?? [];
  const overLimit =
    kind === "EXPENSE" && selectedCard !== undefined && cents > selectedCard.availableInCents;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={text.title} initialFocusId="tx-amount">
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div
          role="group"
          aria-label="Tipo de lançamento"
          className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {(["EXPENSE", "INCOME"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => switchKind(k)}
              className={cn(
                "min-h-11 rounded-lg text-sm font-semibold",
                kind === k
                  ? "bg-white dark:bg-slate-100 text-slate-900 shadow-sm"
                  : "text-slate-600",
              )}
            >
              {TEXT[k].title}
            </button>
          ))}
        </div>

        {banner ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {banner}
          </p>
        ) : null}

        <Field id="tx-amount" label="Valor" error={errors.amountInCents}>
          <MoneyInput
            id="tx-amount"
            large
            autoFocus
            value={cents}
            onChange={(c) => {
              setCents(c);
              // validação reativa: o erro some assim que o valor fica válido (US-039)
              if (c > 0) setErrors((e) => ({ ...e, amountInCents: undefined }));
            }}
            invalid={Boolean(errors.amountInCents)}
            describedBy={errors.amountInCents ? "tx-amount-error" : undefined}
          />
        </Field>

        <Field
          id="tx-account"
          label={kind === "EXPENSE" ? "Pagar com" : "Receber em"}
          error={errors.accountId ?? errors.cardId}
        >
          <select
            id="tx-account"
            className={inputClass}
            value={effectiveSource}
            onChange={(e) => setSource(e.target.value)}
            aria-invalid={errors.accountId || errors.cardId ? true : undefined}
          >
            <option value="" disabled>
              {kind === "EXPENSE" ? "Escolha uma conta ou um cartão" : "Escolha uma conta"}
            </option>
            <optgroup label="Contas">
              {(accounts.data?.items ?? []).map((a) => (
                <option key={a.id} value={`acc:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            {kind === "EXPENSE" && cardList.length > 0 ? (
              <optgroup label="Cartões">
                {cardList.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.name} · Disponível {fmt(c.availableInCents)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </Field>
        {kind === "EXPENSE" && cards.data && cardList.length === 0 ? (
          <Link
            href="/cartoes"
            onClick={() => onOpenChange(false)}
            className="-mt-3 flex min-h-11 items-center self-start text-sm font-medium text-brand-800 dark:text-emerald-300 underline"
          >
            Cadastrar cartão
          </Link>
        ) : null}
        {selectedCard && kind === "EXPENSE" ? (
          <p data-testid="invoice-hint" className="-mt-3 text-sm text-slate-600">
            {invoiceHint(
              date || defaults.data?.today || new Date().toISOString().slice(0, 10),
              selectedCard.closingDay,
              selectedCard.dueDay,
            )}
          </p>
        ) : null}
        {overLimit && selectedCard ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
          >
            Esta compra ultrapassa o limite disponível do cartão
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span id="tx-category-label" className="text-sm font-medium text-slate-800">
            Categoria
          </span>
          <div
            ref={categoryRef}
            role="radiogroup"
            aria-labelledby="tx-category-label"
            aria-invalid={errors.categoryId ? true : undefined}
            className={cn(
              "grid grid-cols-3 gap-2 rounded-xl",
              errors.categoryId && "ring-2 ring-red-600 ring-offset-2",
            )}
          >
            {categories.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-[72px] animate-pulse rounded-xl bg-slate-200"
                  />
                ))
              : (categories.data?.items ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={categoryId === c.id}
                    onClick={() => {
                      setCategoryId(c.id);
                      setErrors((e) => ({ ...e, categoryId: undefined }));
                    }}
                    className={cn(
                      "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-medium",
                      categoryId === c.id
                        ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                        : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <CategoryIcon icon={c.icon} />
                    <span>{c.name}</span>
                  </button>
                ))}
          </div>
          {errors.categoryId ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {errors.categoryId}
            </p>
          ) : null}
          <Link
            href={`/categorias?kind=${kind}`}
            onClick={() => onOpenChange(false)}
            className="flex min-h-11 items-center self-start text-sm font-medium text-brand-800 dark:text-emerald-300 underline"
          >
            Gerenciar categorias
          </Link>
        </div>

        <Field
          id="tx-description"
          label="Descrição (opcional)"
          error={errors.description ?? liveDescriptionError}
          hint="Se vazia, usamos o nome da categoria."
        >
          <input
            id="tx-description"
            className={inputClass}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((x) => ({ ...x, description: undefined }));
            }}
            aria-invalid={errors.description || liveDescriptionError ? true : undefined}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id="tx-payer-label" className="text-sm font-medium text-slate-800">
            {text.payer}
          </span>
          <div role="radiogroup" aria-labelledby="tx-payer-label" className="flex flex-wrap gap-2">
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
                    ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                    : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700",
                )}
              >
                <Avatar name={m.name} image={m.image} size={32} />
                {m.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {kind === "EXPENSE" && splitAvailable ? (
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span id="tx-shared-label" className="text-sm font-medium text-slate-800">
              Dividir com a família
              <span data-testid="split-label" className="block text-xs font-normal text-slate-500">
                {splitSwitchLabel(shared, defaults.data?.split.ruleShares)}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              aria-labelledby="tx-shared-label"
              onClick={() => setShared((v) => !v)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                shared ? "bg-brand-700" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white dark:bg-slate-100 shadow transition-all",
                  shared ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>
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
            <Field id="tx-date" label="Data" error={errors.occurredOn}>
              <input
                id="tx-date"
                type="date"
                className={inputClass}
                value={date}
                {...(defaults.data ? { max: defaults.data.today } : {})}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.occurredOn ? true : undefined}
              />
            </Field>
            <Field id="tx-note" label="Observação" error={errors.note}>
              <textarea
                id="tx-note"
                className={cn(inputClass, "min-h-20 py-2")}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </details>

        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
          <Button
            type="submit"
            variant={overLimit ? "danger" : "primary"}
            className="w-full"
            disabled={create.isPending || liveDescriptionError !== undefined}
          >
            {create.isPending ? "Salvando…" : overLimit ? "Confirmar mesmo assim" : text.save}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
