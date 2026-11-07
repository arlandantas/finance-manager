"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui/field";
import { useHydrated } from "@/lib/use-hydrated";
import { useTags } from "@/modules/tags/hooks";
import type { LedgerUiFilters } from "@/modules/transacoes/optimistic";

/** Chips dos filtros de tag aplicados (visíveis fora do painel) com remoção individual; inclui o chip "Sem tag". */
export function TagFilterChips({
  filters,
  onChange,
}: {
  filters: LedgerUiFilters;
  onChange: (patch: Partial<LedgerUiFilters>) => void;
}) {
  const selected = filters.tagIds ?? [];
  const all = useTags("", { enabled: selected.length > 0, limit: 500 });
  if (selected.length === 0 && !filters.untagged) return null;
  const name = (id: string) => all.data?.items.find((t) => t.id === id)?.name ?? "…";
  const chip =
    "inline-flex min-h-8 items-center gap-1 rounded-full border border-brand-700 bg-brand-50 py-0.5 pl-3 pr-1 text-sm font-medium text-brand-800 dark:text-emerald-300";
  const remove = "flex h-8 w-8 items-center justify-center rounded-full hover:bg-brand-100";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="tag-filter-chips">
      {filters.untagged ? (
        <span className={chip} data-testid="untagged-chip">
          Sem tag
          <button
            type="button"
            aria-label="Remover filtro Sem tag"
            className={remove}
            onClick={() => onChange({ untagged: undefined })}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </span>
      ) : null}
      {selected.map((id) => (
        <span key={id} className={chip} data-testid="tag-filter-chip">
          {name(id)}
          <button
            type="button"
            aria-label={`Remover filtro da tag ${name(id)}`}
            className={remove}
            onClick={() => {
              const next = selected.filter((x) => x !== id);
              onChange({ tagIds: next.length > 0 ? next : undefined });
            }}
          >
            <X aria-hidden="true" size={14} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** Seletor múltiplo com busca (US-047): lançamentos com QUALQUER uma das tags escolhidas. */
export function TagFilter({
  id,
  filters,
  onChange,
}: {
  id: string;
  filters: LedgerUiFilters;
  onChange: (patch: Partial<LedgerUiFilters>) => void;
}) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);
  const tags = useTags(q, { limit: q ? 20 : 500 });
  const selected = new Set(filters.tagIds ?? []);
  const ready = useHydrated();
  const items = ready ? (tags.data?.items ?? []) : [];
  const toggle = (tagId: string) => {
    const next = selected.has(tagId)
      ? [...selected].filter((x) => x !== tagId)
      : [...selected, tagId];
    onChange({ tagIds: next.length > 0 ? next : undefined });
  };
  return (
    <fieldset className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
      <legend className="text-sm font-medium text-slate-800">Tag</legend>
      <input
        id={`${id}-search`}
        type="search"
        aria-label="Procurar tag"
        placeholder="Procurar tag"
        className={inputClass}
        maxLength={30}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ul
        aria-label="Tags"
        className="flex max-h-40 flex-wrap gap-2 overflow-auto"
        data-testid="tag-filter-options"
      >
        {items.length === 0 && ready && !tags.isPending ? (
          <li className="text-sm text-slate-600">
            {q ? "Nenhuma tag encontrada" : "Nenhuma tag ainda. Crie tags ao lançar uma despesa."}
          </li>
        ) : null}
        {items.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
              />
              {t.name}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
