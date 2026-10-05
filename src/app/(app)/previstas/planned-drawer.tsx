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
import { useFamily } from "@/modules/familia/hooks";
import { useCreatePlanned, useUpdatePlanned } from "@/modules/previstas/hooks";
import {
  CreatePlannedExpenseSchema,
  type PlannedExpenseDTO,
  UpdatePlannedExpenseSchema,
} from "@/modules/previstas/schemas";
import { useDefaults } from "@/modules/transacoes/hooks";

type FieldKey =
  | "description"
  | "amountInCents"
  | "dueOn"
  | "categoryId"
  | "responsibleMemberId"
  | "note";

/** Drawer de nova/edição de despesa prevista (SDD-009 §5). `planned` nulo = criar. */
export function PlannedDrawer({
  open,
  planned,
  onClose,
}: {
  open: boolean;
  planned: PlannedExpenseDTO | null;
  onClose: () => void;
}) {
  const family = useFamily();
  const categories = useCategories("EXPENSE");
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [cents, setCents] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [shared, setShared] = useState(true);
  const splitAvailable = useDefaults(open).data?.split.available ?? false;
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
  const editing = planned !== null;

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
    } else {
      setDescription("");
      setCents(0);
      setCategoryId("");
      setResponsibleId("");
      setShared(true);
      setDueOn("");
      setNote("");
      setDetailsOpen(false);
    }
  }, [open, planned]);

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
    const base = {
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

  const pending = create.isPending || update.isPending;
  const members = family.data?.members ?? [];

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar despesa prevista" : "Nova despesa prevista"}
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
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
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
              onChange={setCents}
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
                      ? "border-brand-700 bg-brand-50 text-brand-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
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
                      ? "border-brand-700 bg-brand-50 text-brand-800"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  <CategoryIcon icon={planned.category.icon} />
                  <span>{planned.category.name} (arquivada)</span>
                </button>
              ) : null}
            </div>
            {errors.categoryId ? (
              <p role="alert" className="text-sm text-red-700">
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

          {splitAvailable ? (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span id="pl-shared-label" className="text-sm font-medium text-slate-800">
                Dividir com a família
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
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
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

          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
