"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { MoneyInput } from "@/components/money-input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { useSourceAccount } from "@/modules/contas/use-source-account";
import { useFamily } from "@/modules/familia/hooks";
import { useCreatePlanned, useUpdatePlanned } from "@/modules/previstas/hooks";
import { addMonths, type MonthISO, monthOf, monthSpan } from "@/modules/previstas/recurrence";
import {
  useCreateSeries,
  useSeries,
  useSeriesImpact,
  useUpdateSeries,
} from "@/modules/previstas/recurring-hooks";
import {
  CreateRecurringExpenseSchema,
  UpdateRecurringExpenseSchema,
} from "@/modules/previstas/recurring-schemas";
import {
  CreatePlannedExpenseSchema,
  type PlannedExpenseDTO,
  UpdatePlannedExpenseSchema,
} from "@/modules/previstas/schemas";
import { splitSwitchLabel } from "@/modules/split/shares-label";
import { useDefaults } from "@/modules/transacoes/hooks";
import { monthLabel } from "../extrato/filters";

type FieldKey =
  | "description"
  | "amountInCents"
  | "dueOn"
  | "categoryId"
  | "responsibleMemberId"
  | "note"
  | "paymentAccountId"
  | "dayOfMonth"
  | "startMonth"
  | "end";

/**
 * Drawer de nova/edição de despesa prevista (SDD-009 §5, SDD-019 §3.6). `planned` nulo = criar.
 * `mode="series"` edita a recorrência ("esta e as próximas") a partir de uma ocorrência.
 */
export function PlannedDrawer({
  open,
  planned,
  mode = "one",
  onClose,
}: {
  open: boolean;
  planned: PlannedExpenseDTO | null;
  mode?: "one" | "series";
  onClose: () => void;
}) {
  const family = useFamily();
  const categories = useCategories("EXPENSE");
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [shared, setShared] = useState(false); // "Só meu" por padrão (US-030)
  const defaultsQ = useDefaults(open);
  const splitAvailable = defaultsQ.data?.split.available ?? false;
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const create = useCreatePlanned(key);
  const update = useUpdatePlanned(key);
  const createSeries = useCreateSeries(key);
  const updateSeries = useUpdateSeries(key);
  const editing = planned !== null;
  const seriesMode = mode === "series" && planned?.series != null;
  const seriesId = seriesMode ? (planned?.series?.id ?? null) : null;
  const seriesQ = useSeries(seriesId);
  const series = seriesQ.data?.series ?? null;
  const accounts = useAccounts();
  const [repeat, setRepeat] = useState(false);
  const [day, setDay] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endKind, setEndKind] = useState<"NONE" | "COUNT">("NONE");
  const [endMonths, setEndMonths] = useState("");
  const source = useSourceAccount({
    open,
    amountInCents: cents,
    ownerMemberId: responsibleId || undefined,
    accounts: accounts.data?.items ?? [],
    preferredAccountId: (seriesMode ? series?.paymentAccount : planned?.paymentAccount)?.id,
  });
  const today = defaultsQ.data?.today;
  const currentMonth = today ? monthOf(today) : null;
  const effectiveFrom =
    seriesMode && planned?.occurrenceMonth
      ? currentMonth && planned.occurrenceMonth < currentMonth
        ? currentMonth
        : planned.occurrenceMonth
      : undefined;
  const impact = useSeriesImpact(seriesMode ? seriesId : null, effectiveFrom);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBanner(null);
    setConflict(null);
    setKey(newIdempotencyKey());
    if (planned) {
      setDescription(planned.description);
      setCents(planned.amountInCents);
      setCategoryId(planned.category.id);
      setResponsibleId(planned.responsible.id);
      setShared(planned.isSharedExpense);
      setDueOn(planned.dueOn);
      setNote(planned.note ?? "");
      setDetailsOpen(false);
      setRepeat(false);
    } else {
      setDescription("");
      setCents(0);
      setCategoryId("");
      setResponsibleId("");
      setShared(false);
      setDueOn("");
      setNote("");
      setDetailsOpen(false);
      setRepeat(false);
      setDay("");
      setEndKind("NONE");
      setEndMonths("");
    }
  }, [open, planned]);

  // Edição "esta e as próximas": os campos vêm da série (não da ocorrência).
  useEffect(() => {
    if (!open || !seriesMode || !series) return;
    setDescription(series.description);
    setCents(series.amountInCents);
    setCategoryId(series.category.id);
    setResponsibleId(series.responsible.id);
    setShared(series.isSharedExpense);
    setDay(String(series.dayOfMonth));
    setEndKind(series.endMonth ? "COUNT" : "NONE");
    setEndMonths(
      series.endMonth
        ? String(monthSpan(series.startMonth as MonthISO, series.endMonth as MonthISO))
        : "",
    );
  }, [open, seriesMode, series?.id, series?.version]);

  useEffect(() => {
    if (!open || planned || !today) return;
    setStartMonth((cur) => cur || monthOf(today));
    setDay((cur) => cur || String(Number(today.slice(8, 10))));
  }, [open, planned, today]);

  const me = family.data?.currentMemberId;
  useEffect(() => {
    if (open && !planned && me) setResponsibleId((cur) => cur || me);
  }, [open, planned, me]);

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
    else if (e instanceof ApiClientError && Array.isArray(e.details)) {
      const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
      setErrors(next);
      if (next.dueOn || next.note) setDetailsOpen(true);
      if (Object.keys(next).length === 0) setBanner(e.message);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function submit() {
    if (submitting.current) return;
    const accountId = source.accountId;
    const legacyWithoutAccount = editing && !seriesMode && !planned?.paymentAccount && !accountId;
    if (!accountId && !legacyWithoutAccount) {
      setErrors({ paymentAccountId: "Escolha de qual conta vai sair" });
      return;
    }
    const endInput =
      endKind === "COUNT" ? { kind: "COUNT", months: Number(endMonths) } : { kind: "NONE" };
    if (repeat && !editing) {
      const parsedSeries = CreateRecurringExpenseSchema.safeParse({
        description,
        amountInCents: cents,
        categoryId,
        ...(responsibleId ? { responsibleMemberId: responsibleId } : {}),
        isSharedExpense: splitAvailable ? shared : false,
        paymentAccountId: accountId,
        dayOfMonth: Number(day),
        startMonth,
        end: endInput,
      });
      if (!parsedSeries.success) {
        setErrors(
          fieldsFrom(
            parsedSeries.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
        return;
      }
      setErrors({});
      setBanner(null);
      submitting.current = true;
      createSeries.mutate(parsedSeries.data as never, {
        onSuccess: (r) => {
          toast.success(`Despesa recorrente cadastrada: ${r.generatedCount} previstas criadas`);
          onClose();
        },
        onError,
        onSettled: () => {
          submitting.current = false;
        },
      });
      return;
    }
    if (seriesMode && series) {
      const parsedUpdate = UpdateRecurringExpenseSchema.safeParse({
        version: series.version,
        ...(effectiveFrom ? { effectiveFrom } : {}),
        description,
        amountInCents: cents,
        categoryId,
        ...(responsibleId ? { responsibleMemberId: responsibleId } : {}),
        isSharedExpense: splitAvailable ? shared : series.isSharedExpense,
        ...(accountId ? { paymentAccountId: accountId } : {}),
        dayOfMonth: Number(day),
        end: endInput,
      });
      if (!parsedUpdate.success) {
        setErrors(
          fieldsFrom(
            parsedUpdate.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
        return;
      }
      setErrors({});
      setBanner(null);
      submitting.current = true;
      updateSeries.mutate(
        { id: series.id, input: parsedUpdate.data as never },
        {
          onSuccess: (r) => {
            toast.success(
              r.affectedCount === 1
                ? "Recorrência atualizada: 1 prevista alterada"
                : `Recorrência atualizada: ${r.affectedCount} previstas alteradas`,
            );
            onClose();
          },
          onError,
          onSettled: () => {
            submitting.current = false;
          },
        },
      );
      return;
    }
    const base = {
      ...(accountId ? { paymentAccountId: accountId } : {}),
      description,
      amountInCents: cents,
      categoryId,
      ...(responsibleId ? { responsibleMemberId: responsibleId } : {}),
      isSharedExpense: splitAvailable ? shared : (planned?.isSharedExpense ?? false),
      ...(dueOn ? { dueOn } : {}),
    };
    const parsed = planned
      ? UpdatePlannedExpenseSchema.safeParse({
          ...base,
          version: planned.version,
          note: note.trim() === "" ? null : note,
        })
      : CreatePlannedExpenseSchema.safeParse({ ...base, ...(note.trim() ? { note } : {}) });
    if (!parsed.success) {
      const next = fieldsFrom(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.dueOn || next.note) setDetailsOpen(true);
      return;
    }
    setErrors({});
    setBanner(null);
    submitting.current = true;
    const done = {
      onSuccess: () => {
        toast.success(planned ? "Despesa prevista atualizada" : "Despesa prevista cadastrada!");
        onClose();
      },
      onError,
      onSettled: () => {
        submitting.current = false;
      },
    };
    if (planned) update.mutate({ id: planned.id, input: parsed.data as never }, done);
    else create.mutate(parsed.data as never, done);
  }

  const pending =
    create.isPending || update.isPending || createSeries.isPending || updateSeries.isPending;
  const showDayFields = seriesMode || (repeat && !editing);
  const monthOptions = currentMonth
    ? Array.from({ length: 12 }, (_, i) => addMonths(currentMonth as MonthISO, i))
    : [];
  const members = family.data?.members ?? [];

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={
        seriesMode
          ? "Editar esta e as próximas"
          : editing
            ? "Editar despesa prevista"
            : "Nova despesa prevista"
      }
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
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
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
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
            >
              {banner}
            </p>
          ) : null}

          <Field id="pl-description" label="Descrição" error={errors.description}>
            <input
              id="pl-description"
              className={inputClass}
              autoFocus
              autoComplete="off"
              maxLength={100}
              placeholder="Ex.: Condomínio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description ? true : undefined}
            />
          </Field>

          <Field id="pl-amount" label="Valor previsto" error={errors.amountInCents}>
            <MoneyInput
              id="pl-amount"
              large
              value={cents}
              onChange={(c) => {
                setCents(c);
                // validação reativa: o erro some assim que o valor fica válido (US-039)
                if (c > 0) setErrors((e) => ({ ...e, amountInCents: undefined }));
              }}
              invalid={Boolean(errors.amountInCents)}
              describedBy={errors.amountInCents ? "pl-amount-error" : undefined}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span id="pl-category-label" className="text-sm font-medium text-slate-800">
              Categoria
            </span>
            <div
              role="radiogroup"
              aria-labelledby="pl-category-label"
              aria-invalid={errors.categoryId ? true : undefined}
              className={cn(
                "grid grid-cols-3 gap-2 rounded-xl",
                errors.categoryId && "ring-2 ring-red-600 ring-offset-2",
              )}
            >
              {(categories.data?.items ?? []).map((c) => (
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
              {/* a categoria atual pode ter sido arquivada depois do cadastro */}
              {planned &&
              !(categories.data?.items ?? []).some((c) => c.id === planned.category.id) ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={categoryId === planned.category.id}
                  onClick={() => setCategoryId(planned.category.id)}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-xs font-medium",
                    categoryId === planned.category.id
                      ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                      : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700",
                  )}
                >
                  <CategoryIcon icon={planned.category.icon} />
                  <span>{planned.category.name} (arquivada)</span>
                </button>
              ) : null}
            </div>
            {errors.categoryId ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {errors.categoryId}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span id="pl-responsible-label" className="text-sm font-medium text-slate-800">
              Responsável pelo pagamento
            </span>
            <div
              role="radiogroup"
              aria-labelledby="pl-responsible-label"
              className="flex flex-wrap gap-2"
            >
              {members.map((m) => (
                <button
                  key={m.memberId}
                  type="button"
                  role="radio"
                  aria-checked={responsibleId === m.memberId}
                  aria-label={m.name.split(" ")[0]}
                  onClick={() => setResponsibleId(m.memberId)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium",
                    responsibleId === m.memberId
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

          {splitAvailable ? (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span id="pl-shared-label" className="text-sm font-medium text-slate-800">
                Dividir com a família
                <span
                  data-testid="split-label"
                  className="block text-xs font-normal text-slate-500"
                >
                  {splitSwitchLabel(shared, defaultsQ.data?.split.ruleShares)}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={shared}
                aria-labelledby="pl-shared-label"
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

          <Field
            id="pl-account"
            label="Pagar com"
            error={errors.paymentAccountId}
            hint={source.reasonText || undefined}
          >
            <select
              id="pl-account"
              className={inputClass}
              value={source.accountId}
              onChange={(e) => {
                source.pick(e.target.value);
                setErrors((er) => ({ ...er, paymentAccountId: undefined }));
              }}
              aria-invalid={errors.paymentAccountId ? true : undefined}
            >
              <option value="">Escolha a conta</option>
              {(accounts.data?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          {!editing ? (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span id="pl-repeat-label" className="text-sm font-medium text-slate-800">
                Repetir todo mês
                <span className="block text-xs font-normal text-slate-500">
                  Cadastre uma vez e as previstas dos próximos 12 meses são criadas.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={repeat}
                aria-labelledby="pl-repeat-label"
                onClick={() => setRepeat((v) => !v)}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  repeat ? "bg-brand-700" : "bg-slate-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white dark:bg-slate-100 shadow transition-all",
                    repeat ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          ) : null}

          {seriesMode ? (
            <p
              data-testid="series-impact"
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
            >
              {impact.isPending
                ? "Calculando o que será alterado…"
                : impact.data
                  ? `Vale para ${impact.data.affectedCount} ${
                      impact.data.affectedCount === 1 ? "prevista pendente" : "previstas pendentes"
                    } a partir de ${effectiveFrom ? monthLabel(effectiveFrom) : "este mês"}.${
                      impact.data.keptPaidCount > 0
                        ? ` ${impact.data.keptPaidCount} já paga(s) não mudam.`
                        : ""
                    }${
                      impact.data.keptExceptionCount > 0
                        ? ` ${impact.data.keptExceptionCount} alterada(s) só naquela vez também não mudam.`
                        : ""
                    }`
                  : "Não foi possível calcular o impacto."}
            </p>
          ) : null}

          {showDayFields ? (
            <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-3">
              <Field
                id="pl-day"
                label="Dia do vencimento"
                error={errors.dayOfMonth}
                hint="Nos meses sem esse dia, vence no último dia do mês."
              >
                <input
                  id="pl-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  className={inputClass}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  aria-invalid={errors.dayOfMonth ? true : undefined}
                />
              </Field>
              {!editing ? (
                <Field id="pl-start" label="Começa em" error={errors.startMonth}>
                  <select
                    id="pl-start"
                    className={inputClass}
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  >
                    {monthOptions.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <span id="pl-end-label" className="text-sm font-medium text-slate-800">
                  Termina
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="pl-end-label"
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
                          : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {endKind === "COUNT" ? (
                  <Field
                    id="pl-end-months"
                    label="Quantos meses no total"
                    error={errors.end}
                    hint="Contado desde o primeiro mês da recorrência."
                  >
                    <input
                      id="pl-end-months"
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
              </div>
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
              {showDayFields ? null : (
                <Field
                  id="pl-due"
                  label="Vencimento"
                  error={errors.dueOn}
                  hint="Se vazio, vence hoje."
                >
                  <input
                    id="pl-due"
                    type="date"
                    className={inputClass}
                    value={dueOn}
                    onChange={(e) => setDueOn(e.target.value)}
                    aria-invalid={errors.dueOn ? true : undefined}
                  />
                </Field>
              )}
              <Field id="pl-note" label="Observação" error={errors.note}>
                <textarea
                  id="pl-note"
                  className={cn(inputClass, "min-h-20 py-2")}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </div>
          </details>

          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white dark:bg-slate-100 p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
