"use client";

import { Field, inputClass } from "@/components/ui/field";
import { useCards } from "@/modules/cartoes/hooks";
import { useAllCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { useFamily } from "@/modules/familia/hooks";
import type { LedgerUiFilters } from "@/modules/transacoes/optimistic";

export function FiltersPanel({
  filters,
  onChange,
  idPrefix,
}: {
  filters: LedgerUiFilters;
  onChange: (patch: Partial<LedgerUiFilters>) => void;
  idPrefix: string;
}) {
  const accounts = useAccounts();
  const cards = useCards();
  const family = useFamily();
  const categories = useAllCategories();
  const id = (name: string) => `${idPrefix}-${name}`;
  const empty = (v: string) => (v === "" ? undefined : v);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field id={id("account")} label="Conta">
        <select
          id={id("account")}
          className={inputClass}
          value={filters.accountId ?? ""}
          onChange={(e) => onChange({ accountId: empty(e.target.value) })}
        >
          <option value="">Todas</option>
          {(accounts.data?.items ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id("card")} label="Cartão">
        <select
          id={id("card")}
          className={inputClass}
          value={filters.cardId ?? ""}
          onChange={(e) => onChange({ cardId: empty(e.target.value) })}
        >
          <option value="">Todos</option>
          {(cards.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id("member")} label="Membro">
        <select
          id={id("member")}
          className={inputClass}
          value={filters.memberId ?? ""}
          onChange={(e) => onChange({ memberId: empty(e.target.value) })}
        >
          <option value="">Todos</option>
          {(family.data?.members ?? []).map((m) => (
            <option key={m.memberId} value={m.memberId}>
              {m.name.split(" ")[0]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id("category")} label="Categoria">
        <select
          id={id("category")}
          className={inputClass}
          value={filters.categoryId ?? ""}
          onChange={(e) => onChange({ categoryId: empty(e.target.value) })}
        >
          <option value="">Todas</option>
          {(categories.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.archived ? `${c.name} (arquivada)` : c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id("type")} label="Tipo">
        <select
          id={id("type")}
          className={inputClass}
          value={filters.type ?? ""}
          onChange={(e) =>
            onChange({ type: (empty(e.target.value) as LedgerUiFilters["type"]) ?? undefined })
          }
        >
          <option value="">Todos</option>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
          <option value="TRANSFER">Transferência</option>
          <option value="INVOICE_PAYMENT">Pagamento de fatura</option>
        </select>
      </Field>
      <Field id={id("shared")} label="Divisão">
        <select
          id={id("shared")}
          className={inputClass}
          value={filters.shared === undefined ? "" : String(filters.shared)}
          onChange={(e) =>
            onChange({ shared: e.target.value === "" ? undefined : e.target.value === "true" })
          }
        >
          <option value="">Todas</option>
          <option value="true">Comum</option>
          <option value="false">Pessoal</option>
        </select>
      </Field>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={filters.includeDeleted === true}
          onChange={(e) => onChange({ includeDeleted: e.target.checked ? true : undefined })}
        />
        Mostrar excluídos
      </label>
    </div>
  );
}
