"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { monthLabel } from "@/app/(app)/extrato/filters";
import { CategoryIcon } from "@/components/category-icon";
import { RepeatFields, WhenSwitch } from "@/components/door-parts";
import { InstallmentPreviewText } from "@/components/installment-preview";
import { useFormatMoney } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { TagInput } from "@/components/tag-input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { SegmentedChoice } from "@/components/ui/segmented-choice";
import { UnlinkedBadge } from "@/components/ui/unlinked-badge";
import { ApiClientError, NetworkError } from "@/lib/http";
import { addMonthsToRef, formatInvoiceLabel, invoiceHint } from "@/modules/cartoes/cycle";
import { useCards } from "@/modules/cartoes/hooks";
import {
  INSTALLMENT_SPLIT_NOTICE,
  showInstallmentNotice,
} from "@/modules/cartoes/installment-copy";
import { MAX_INSTALLMENTS } from "@/modules/cartoes/installments";
import { useCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import {
  availability,
  DOOR_FLAGS,
  type DoorCtx,
  type DoorField,
  type DoorRepeat,
  type DoorState,
  type DoorWhen,
  effectivePayerOf,
  fieldsFromIssues,
  laterHint,
  MODE_DEFAULTS,
  SERIES_NOTE_NOTICE,
  saveLabel,
  seriesDefaults,
  serviceOf,
  sharedAfterModeChange,
  validateDateForWhen,
  validateSubmission,
} from "@/modules/lancamento/door";
import { successText, useDoorKey, useDoorSubmit } from "@/modules/lancamento/use-door-submit";
import { addMonths, type MonthISO, monthOf } from "@/modules/previstas/recurrence";
import { splitSwitchLabel } from "@/modules/split/shares-label";
import { useDefaults } from "@/modules/transacoes/hooks";
import {
  DESCRIPTION_MSG,
  PAID_BEFORE_APP_MSG,
  paidBeforeAppSchema,
} from "@/modules/transacoes/schemas";

type Kind = "EXPENSE" | "INCOME";
const TEXT: Record<Kind, { title: string; payer: string }> = {
  EXPENSE: { title: "Nova despesa", payer: "Quem pagou?" },
  INCOME: { title: "Nova receita", payer: "Quem recebeu?" },
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
  const [sharedTouched, setSharedTouched] = useState(false);
  // US-090/091: "Quando?" e "Repetir"; a data é uma só (occurredOn em NOW, dueOn em LATER)
  const [when, setWhen] = useState<DoorWhen>("NOW");
  const [repeat, setRepeat] = useState<DoorRepeat>("NONE");
  const [day, setDay] = useState<string | null>(null); // null = padrão derivado da data
  const [startMonth, setStartMonth] = useState<string | null>(null);
  const [endKind, setEndKind] = useState<"NONE" | "COUNT">("NONE");
  const [endMonths, setEndMonths] = useState("");
  const [unknownOutcome, setUnknownOutcome] = useState(false); // falha de rede: resultado desconhecido
  const [installments, setInstallments] = useState(1); // US-040a: só vale com cartão
  const [paidText, setPaidText] = useState("0"); // US-065: parcelas já pagas antes do app
  const [nextInvoice, setNextInvoice] = useState("open"); // "open" ou ref da fatura fechada não paga
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]); // US-045: nomes digitados (linha "+ Tag" recolhida)
  const [errors, setErrors] = useState<Partial<Record<DoorField, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // ADR-009: a chave nasce ao abrir o drawer e é reaproveitada nos reenvios até o sucesso.
  const submitting = useRef(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  const defaults = useDefaults(open);
  const splitAvailable = defaults.data?.split.available ?? false;
  const accounts = useAccounts();
  const cards = useCards();
  const family = useFamily();
  const categories = useCategories(kind);
  const doorService = serviceOf({ kind, when, repeat: kind === "EXPENSE" ? repeat : "NONE" });
  const { key, renew: renewKey } = useDoorKey(doorService, unknownOutcome);
  const door = useDoorSubmit(key);

  // Nova abertura: estado limpo e nova chave.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setCents(0);
    setCategoryId("");
    setShared(false);
    setSharedTouched(false);
    setWhen("NOW");
    setRepeat("NONE");
    setDay(null);
    setStartMonth(null);
    setEndKind("NONE");
    setEndMonths("");
    setUnknownOutcome(false);
    setInstallments(1);
    setPaidText("0");
    setNextInvoice("open");
    setDate("");
    setDescription("");
    setNote("");
    setTags([]);
    setErrors({});
    setBanner(null);
    setDetailsOpen(false);
    setSource("");
    setPayerId("");
    renewKey();
  }, [open, initialKind, renewKey]);

  // Padrões vindos do servidor (última conta usada; quem pagou = logado).
  useEffect(() => {
    if (!open || !defaults.data) return;
    // Padrão: último meio usado (cartão da despesa mais recente, senão a conta).
    setSource((cur) => {
      if (cur) return cur;
      if (defaults.data.cardId && when === "NOW") return `card:${defaults.data.cardId}`;
      return defaults.data.accountId ? `acc:${defaults.data.accountId}` : "";
    });
    setPayerId((cur) => cur || defaults.data.payerMemberId);
  }, [open, defaults.data]);

  const cardList = cards.data?.items ?? [];
  // Receita só entra em conta: se o padrão veio como cartão, volta para a primeira conta.
  const effectiveSource = kind === "INCOME" && source.startsWith("card:") ? "" : source;
  const selectedCard = effectiveSource.startsWith("card:")
    ? cardList.find((c) => `card:${c.id}` === effectiveSource)
    : undefined;
  const parcelado = kind === "EXPENSE" && selectedCard !== undefined && installments > 1;
  const paidBeforeApp = paidText.trim() === "" ? 0 : Number(paidText);
  const paidActive = parcelado && paidBeforeApp >= 1;
  // fatura fechada e não paga imediatamente anterior à aberta (SDD-020 §1)
  const closedPrev = selectedCard
    ? selectedCard.payableInvoices.find(
        (i) => i.ref === addMonthsToRef(selectedCard.openInvoice.ref, -1),
      )
    : undefined;
  const effectiveNext =
    nextInvoice !== "open" && closedPrev?.ref === nextInvoice ? nextInvoice : "open";
  // âncora da próxima parcela: hoje (fatura aberta) ou o fechamento da fatura fechada escolhida
  const anchorOn =
    paidActive && effectiveNext !== "open" && closedPrev
      ? closedPrev.closingDate
      : defaults.data?.today || new Date().toISOString().slice(0, 10);
  const paidParsed = paidBeforeAppSchema.safeParse(paidBeforeApp);
  const paidError =
    !parcelado || Number.isNaN(paidBeforeApp)
      ? Number.isNaN(paidBeforeApp)
        ? "Informe um número inteiro de parcelas pagas"
        : undefined
      : !paidParsed.success
        ? (paidParsed.error.issues[0]?.message as string)
        : paidBeforeApp >= installments
          ? PAID_BEFORE_APP_MSG
          : undefined;
  // US-042 libera "Dividir" no parcelado; até lá a UI avisa e não envia `isSharedExpense`
  const splitInstallmentsAvailable = defaults.data?.split.installmentsAvailable ?? false;
  const splitBlocked = parcelado && !splitInstallmentsAvailable;
  // SEC-026: "Só meu" é sempre em nome de quem lança; para registrar o gasto de outra pessoa, divida.
  const myMemberId = family.data?.currentMemberId ?? defaults.data?.payerMemberId ?? "";
  const personalExpense = kind === "EXPENSE" && !(shared && splitAvailable && !splitBlocked);

  // Porta única (SDD-031): o estado vira DoorState e `door.ts` monta o corpo do serviço escolhido.
  const today = defaults.data?.today ?? "";
  const nowIso = today || new Date().toISOString().slice(0, 10);
  const isLater = when === "LATER";
  const seriesOn = isLater && kind === "EXPENSE" && repeat === "MONTHLY";
  const derived = seriesDefaults(date, today);
  const dayValue = day ?? derived.day;
  const startValue = startMonth ?? derived.startMonth;
  const doorState: DoorState = {
    kind,
    when,
    repeat: kind === "EXPENSE" ? repeat : "NONE",
    cents,
    description,
    categoryId,
    source: effectiveSource,
    payerId,
    shared,
    sharedTouched,
    date,
    note,
    tags,
    installments,
    paidBeforeApp: Number.isNaN(paidBeforeApp) ? 0 : paidBeforeApp,
    paidAnchorOn: paidActive && effectiveNext !== "open" ? anchorOn : "",
    day: dayValue,
    startMonth: startValue,
    endKind,
    endMonths,
  };
  const doorCtx: DoorCtx = {
    today,
    me: myMemberId,
    splitAvailable,
    splitBlocked: !isLater && splitBlocked,
    flags: DOOR_FLAGS,
  };
  const effectivePayerId = effectivePayerOf(doorState, doorCtx);
  const avail = availability(doorState, doorCtx);
  const dateError = errors.date ?? validateDateForWhen(date, when, today) ?? undefined;
  const currentMonth = today ? monthOf(today) : null;
  const monthOptions = currentMonth
    ? Array.from(
        new Set(
          [
            ...Array.from({ length: 12 }, (_, i) => addMonths(currentMonth as MonthISO, i)),
            startValue,
          ].filter(Boolean),
        ),
      )
        .sort()
        .map((m) => ({ value: m, label: monthLabel(m) }))
    : [];
  const locked = door.isPending || unknownOutcome;

  function changeWhen(next: DoorWhen) {
    if (next === when) return;
    setWhen(next);
    if (!sharedTouched) setShared(sharedAfterModeChange({ shared, sharedTouched }, next));
    setErrors((e) => ({ ...e, date: undefined }));
    if (validateDateForWhen(date, next, today)) setDetailsOpen(true);
  }

  function switchKind(next: Kind) {
    if (next === kind) return;
    setKind(next);
    if (next === "INCOME") {
      setWhen("NOW"); // receita prevista só com a US-051
      setRepeat("NONE");
    }
    if (next === "INCOME" && source.startsWith("card:")) {
      setSource(defaults.data?.accountId ? `acc:${defaults.data.accountId}` : "");
    }
    setCategoryId("");
    setErrors((e) => ({ ...e, categoryId: undefined }));
  }

  function submit() {
    if (submitting.current) return;
    const result = validateSubmission(doorState, doorCtx);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.date && !isLater) setDetailsOpen(true);
      if (result.errors.note) setDetailsOpen(true);
      if (result.errors.amountInCents) document.getElementById("tx-amount")?.focus();
      else if (result.errors.categoryId)
        categoryRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    const service = result.submission.service;
    door.submit(result.submission, {
      onSuccess: (generated) => {
        toast.success(successText(service, kind, generated));
        onOpenChange(false);
      },
      onError: (e) => {
        if (e instanceof NetworkError) {
          setBanner(e.message);
          setUnknownOutcome(true);
        } else if (e instanceof ApiClientError && Array.isArray(e.details)) {
          const next = fieldsFromIssues(e.details as Array<{ path: string; message: string }>);
          setErrors(next);
          if ((next.date && !isLater) || next.note) setDetailsOpen(true);
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
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SegmentedChoice
          label="Tipo de lançamento"
          value={kind}
          onChange={switchKind}
          options={[
            { value: "EXPENSE", label: "Despesa", icon: ArrowDownCircle, tone: "expense" },
            { value: "INCOME", label: "Receita", icon: ArrowUpCircle, tone: "income" },
          ]}
        />

        <WhenSwitch
          when={when}
          repeat={doorState.repeat}
          onChange={changeWhen}
          later={avail.later}
          locked={locked}
        />

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
          error={errors.source}
        >
          <select
            id="tx-account"
            className={inputClass}
            value={effectiveSource}
            onChange={(e) => {
              setSource(e.target.value);
              if (!e.target.value.startsWith("card:")) setInstallments(1); // conta: volta a 1x
            }}
            aria-invalid={errors.source ? true : undefined}
          >
            {isLater ? (
              <option value="">Escolher ao dar baixa</option>
            ) : (
              <option value="" disabled>
                {kind === "EXPENSE" ? "Escolha uma conta ou um cartão" : "Escolha uma conta"}
              </option>
            )}
            <optgroup label="Contas">
              {(accounts.data?.items ?? []).map((a) => (
                <option key={a.id} value={`acc:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            {kind === "EXPENSE" && !isLater && cardList.length > 0 ? (
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
        {kind === "EXPENSE" && !isLater && cards.data && cardList.length === 0 ? (
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
              paidActive
                ? anchorOn
                : date || defaults.data?.today || new Date().toISOString().slice(0, 10),
              selectedCard.closingDay,
              selectedCard.dueDay,
            )}
          </p>
        ) : null}
        {selectedCard && kind === "EXPENSE" ? (
          <>
            <Field id="tx-installments" label="Parcelas" error={errors.installments}>
              <select
                id="tx-installments"
                className={inputClass}
                value={installments}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setInstallments(n);
                  if (n < 2) setPaidText("0");
                  setErrors((x) => ({ ...x, installments: undefined, paidBeforeApp: undefined }));
                }}
                aria-invalid={errors.installments ? true : undefined}
              >
                {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </Field>
            {installments > 1 ? (
              <>
                <Field
                  id="tx-paid-before"
                  label="Parcelas já pagas"
                  hint="Quantas já foram pagas antes de usar o app?"
                  error={errors.paidBeforeApp ?? paidError}
                >
                  <input
                    id="tx-paid-before"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={installments - 1}
                    step={1}
                    className={inputClass}
                    value={paidText}
                    onChange={(e) => {
                      setPaidText(e.target.value);
                      setErrors((x) => ({ ...x, paidBeforeApp: undefined }));
                    }}
                    aria-invalid={errors.paidBeforeApp || paidError ? true : undefined}
                  />
                </Field>
                {paidActive && !paidError ? (
                  <Field id="tx-next-invoice" label="Próxima parcela na fatura de">
                    <select
                      id="tx-next-invoice"
                      className={inputClass}
                      value={effectiveNext}
                      onChange={(e) => setNextInvoice(e.target.value)}
                    >
                      <option value="open">
                        {formatInvoiceLabel(selectedCard.openInvoice.ref)} (aberta)
                      </option>
                      {closedPrev ? (
                        <option value={closedPrev.ref}>
                          {formatInvoiceLabel(closedPrev.ref)} (fechada, ainda não paga)
                        </option>
                      ) : null}
                    </select>
                  </Field>
                ) : null}
              </>
            ) : null}
            <div aria-live="polite" className="-mt-3">
              {installments > 1 && cents >= installments && !paidError ? (
                <InstallmentPreviewText
                  totalInCents={cents}
                  count={installments}
                  purchaseOn={paidActive ? anchorOn : date || anchorOn}
                  closingDay={selectedCard.closingDay}
                  paidBeforeApp={paidBeforeApp}
                />
              ) : null}
            </div>
          </>
        ) : null}
        {overLimit && selectedCard ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
          >
            {parcelado
              ? "Esta compra passa do limite disponível"
              : "Esta compra ultrapassa o limite disponível do cartão"}
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
              "grid grid-cols-4 gap-1.5 rounded-xl",
              errors.categoryId && "ring-2 ring-red-600 ring-offset-2",
            )}
          >
            {categories.isPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-14 animate-pulse rounded-xl bg-slate-200"
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
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center text-xs font-medium",
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
          label={isLater ? "Descrição" : "Descrição (opcional)"}
          error={errors.description ?? liveDescriptionError}
          hint={isLater ? undefined : "Se vazia, usamos o nome da categoria."}
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

        {isLater ? null : (
          <TagInput
            value={tags}
            onChange={(next) => {
              setTags(next);
              setErrors((x) => ({ ...x, tags: undefined }));
            }}
            error={errors.tags}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <span id="tx-payer-label" className="text-sm font-medium text-slate-800">
            {isLater ? "Responsável pelo pagamento" : text.payer}
          </span>
          <div role="radiogroup" aria-labelledby="tx-payer-label" className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.memberId}
                type="button"
                role="radio"
                aria-checked={effectivePayerId === m.memberId}
                aria-label={m.name.split(" ")[0]}
                aria-describedby={m.unlinked ? `tx-unlinked-${m.memberId}` : undefined}
                aria-disabled={personalExpense && m.memberId !== myMemberId ? true : undefined}
                onClick={() => {
                  if (!(personalExpense && m.memberId !== myMemberId)) setPayerId(m.memberId);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium",
                  personalExpense && m.memberId !== myMemberId && "opacity-50",
                  effectivePayerId === m.memberId
                    ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                    : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700",
                )}
              >
                <Avatar name={m.name} image={m.image} size={32} />
                {m.name.split(" ")[0]}
                {m.unlinked ? (
                  <UnlinkedBadge
                    id={`tx-unlinked-${m.memberId}`}
                    className="px-1.5 py-0.5 text-[11px]"
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {kind === "EXPENSE" && splitAvailable ? (
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span id="tx-shared-label" className="text-sm font-medium text-slate-800">
              Dividir com a família
              <span data-testid="split-label" className="block text-xs font-normal text-slate-500">
                {splitBlocked
                  ? "Disponível em breve para compras parceladas"
                  : splitSwitchLabel(shared, defaults.data?.split.ruleShares)}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={shared && !splitBlocked}
              aria-disabled={splitBlocked || undefined}
              aria-describedby={splitBlocked ? "tx-installment-notice" : undefined}
              aria-labelledby="tx-shared-label"
              onClick={() => {
                if (splitBlocked) return;
                setShared((v) => !v);
                setSharedTouched(true);
              }}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                shared && !splitBlocked ? "bg-brand-700" : "bg-slate-300",
                splitBlocked && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-6 w-6 rounded-full bg-white dark:bg-slate-100 shadow transition-all",
                  shared && !splitBlocked ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>
        ) : null}
        {isLater && personalExpense ? (
          <p role="note" data-testid="mode-default-note" className="text-xs text-slate-600">
            Padrão deste modo: {MODE_DEFAULTS.LATER.shared ? "Dividir" : "Só meu"}
          </p>
        ) : null}
        {personalExpense && members.length > 1 ? (
          <p
            role="note"
            data-testid="personal-self-payer-notice"
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
          >
            Despesa "Só meu" é sempre em seu nome. Depois de salvar, só você, o dono da conta (ou do
            cartão) e quem a lançou poderão alterá-la.
            {splitAvailable
              ? ' Para registrar o gasto de outra pessoa, ative "Dividir com a família".'
              : ""}
          </p>
        ) : null}
        {splitBlocked && showInstallmentNotice(splitAvailable) ? (
          <p
            id="tx-installment-notice"
            role="note"
            data-testid="installment-notice"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            {INSTALLMENT_SPLIT_NOTICE}
          </p>
        ) : null}

        {isLater && !seriesOn ? (
          <Field id="tx-date" label="Vencimento" error={dateError} hint="Se vazio, vence hoje.">
            <input
              id="tx-date"
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError ? true : undefined}
            />
          </Field>
        ) : null}
        {isLater && kind === "EXPENSE" ? (
          <RepeatFields
            repeat={doorState.repeat}
            onRepeat={setRepeat}
            locked={locked}
            day={dayValue}
            onDay={(v) => setDay(v)}
            startMonth={startValue}
            onStartMonth={(v) => setStartMonth(v)}
            monthOptions={monthOptions}
            endKind={endKind}
            onEndKind={setEndKind}
            endMonths={endMonths}
            onEndMonths={setEndMonths}
            errors={errors}
          />
        ) : null}

        {seriesOn ? (
          note.trim() ? (
            <p
              role="note"
              data-testid="series-note-notice"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
            >
              {SERIES_NOTE_NOTICE}
            </p>
          ) : null
        ) : (
          <details
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="rounded-lg border border-slate-200 p-3"
          >
            <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
              Mais detalhes
            </summary>
            <div className="mt-3 flex flex-col gap-4">
              {paidActive || isLater ? null : (
                <Field id="tx-date" label="Data" error={dateError}>
                  <input
                    id="tx-date"
                    type="date"
                    className={inputClass}
                    value={date}
                    {...(defaults.data ? { max: defaults.data.today } : {})}
                    onChange={(e) => setDate(e.target.value)}
                    aria-invalid={dateError ? true : undefined}
                  />
                </Field>
              )}
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
        )}

        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
          <Button
            type="submit"
            variant={overLimit ? "danger" : "primary"}
            className="w-full"
            disabled={
              door.isPending || liveDescriptionError !== undefined || paidError !== undefined
            }
          >
            {door.isPending
              ? "Salvando…"
              : overLimit
                ? "Confirmar mesmo assim"
                : saveLabel({ kind, when })}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
