"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { useHydrated } from "@/lib/use-hydrated";
import type { AnalysisGroupBy } from "@/modules/analise/schemas";
import { type AnaliseFilters, hasFilters } from "@/modules/analise/url";
import { useCards } from "@/modules/cartoes/hooks";
import { useAllCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";
import { TagFilter } from "../extrato/tag-filter";

export const GROUP_LABEL: Record<AnalysisGroupBy, string> = {
  category: "Categoria",
  member: "Membro",
  account: "Conta/cartão",
  tag: "Tag",
};

export function GroupTabs({
  value,
  onChange,
}: {
  value: AnalysisGroupBy;
  onChange: (g: AnalysisGroupBy) => void;
}) {
  return (
    <div role="tablist" aria-label="Agrupar por" className="flex flex-wrap gap-2">
      {(Object.keys(GROUP_LABEL) as AnalysisGroupBy[]).map((g) => (
        <button
          key={g}
          type="button"
          role="tab"
          aria-selected={value === g}
          onClick={() => onChange(g)}
          className={cn(
            "min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium",
            value === g
              ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
              : "border-slate-300 bg-white text-slate-800",
          )}
        >
          {GROUP_LABEL[g]}
        </button>
      ))}
    </div>
  );
}

/** Filtros combináveis (OU dentro, E entre). Cada seletor edita o 1º id; a URL aceita vários. */
export function AnaliseFiltersPanel({
  filters,
  onChange,
}: {
  filters: AnaliseFilters;
  onChange: (patch: Partial<AnaliseFilters>) => void;
}) {
  const accounts = useAccounts();
  const cards = useCards();
  const family = useFamily();
  const categories = useAllCategories();
  // opções vindas do cache só após hidratar: o 1º render do cliente deve igualar o HTML do servidor
  const ready = useHydrated();
  const one = (v: string) => (v === "" ? undefined : [v]);
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
      open={hasFilters(filters)}
    >
      <summary className="min-h-11 cursor-pointer text-sm font-medium text-slate-800">
        Filtros
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="an-member" label="Membro">
          <select
            id="an-member"
            className={inputClass}
            value={filters.payerIds?.[0] ?? ""}
            onChange={(e) => onChange({ payerIds: one(e.target.value) })}
          >
            <option value="">Todos</option>
            {(ready ? (family.data?.members ?? []) : []).map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {memberOptionLabel({ name: m.name.split(" ")[0] as string, unlinked: m.unlinked })}
              </option>
            ))}
          </select>
        </Field>
        <Field id="an-source" label="Conta ou cartão">
          <select
            id="an-source"
            className={inputClass}
            value={filters.sourceIds?.[0] ?? ""}
            onChange={(e) => onChange({ sourceIds: one(e.target.value) })}
          >
            <option value="">Todas</option>
            {(ready ? (accounts.data?.items ?? []) : []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {(ready ? (cards.data?.items ?? []) : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (cartão)
              </option>
            ))}
          </select>
        </Field>
        <Field id="an-category" label="Categoria">
          <select
            id="an-category"
            className={inputClass}
            value={filters.categoryIds?.[0] ?? ""}
            onChange={(e) => onChange({ categoryIds: one(e.target.value) })}
          >
            <option value="">Todas</option>
            {(ready ? (categories.data?.items ?? []) : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.archived ? `${c.name} (arquivada)` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={filters.untagged === true}
            disabled={(filters.tagIds?.length ?? 0) > 0}
            onChange={(e) => onChange({ untagged: e.target.checked ? true : undefined })}
          />
          Sem tag
        </label>
        <TagFilter
          id="an-tag"
          filters={{ ...(filters.tagIds ? { tagIds: filters.tagIds } : {}) }}
          onChange={(patch) =>
            onChange({ tagIds: patch.tagIds, ...(patch.tagIds ? { untagged: undefined } : {}) })
          }
        />
      </div>
      {hasFilters(filters) ? (
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() =>
            onChange({
              categoryIds: undefined,
              payerIds: undefined,
              sourceIds: undefined,
              tagIds: undefined,
              untagged: undefined,
            })
          }
        >
          Limpar filtros
        </Button>
      ) : null}
    </details>
  );
}
