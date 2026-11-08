"use client";

import Link from "next/link";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/field";
import {
  canSelect,
  hasFlag,
  isChosen,
  needsAttention,
  type ReviewItem,
} from "@/modules/importacao/review";

export type Option = { id: string; name: string };
export type ItemPatch = Partial<
  Pick<ReviewItem, "date" | "description" | "amountInCents" | "categoryId" | "payerMemberId">
>;

const MARK = "rounded-full px-2 py-0.5 text-xs font-medium";

function Marks({ item }: { item: ReviewItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasFlag(item, "ALREADY_IMPORTED") ? (
        <span className={cn(MARK, "bg-slate-200 text-slate-800")}>Já importado</span>
      ) : null}
      {hasFlag(item, "ALREADY_POSTED_PARCEL") ? (
        <span className={cn(MARK, "bg-slate-200 text-slate-800")}>Já lançada</span>
      ) : null}
      {hasFlag(item, "POSSIBLE_DUPLICATE") ? (
        <span className={cn(MARK, "bg-amber-100 text-amber-900")}>
          Possível duplicado
          {item.duplicateOf ? (
            <>
              {" · "}
              <Link
                href={`/extrato?highlight=${item.duplicateOf}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                ver lançamento
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
      {needsAttention(item) ? (
        <span className={cn(MARK, "bg-red-100 text-red-900")}>Precisa de atenção</span>
      ) : null}
      {item.installment ? (
        <span className={cn(MARK, "bg-slate-100 text-slate-700")}>
          Parcela {item.installment.no}/{item.installment.count}
        </span>
      ) : null}
    </div>
  );
}

function ReadOnlyRow({ item }: { item: ReviewItem }) {
  return (
    <li
      data-testid="import-item"
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm"
    >
      <span className="min-w-0 break-words text-slate-700">{item.description}</span>
      <Money cents={Number(item.amountInCents ?? 0)} />
    </li>
  );
}

export function ImportItemRow({
  item,
  categories,
  members,
  onPatch,
  onSelect,
  onRemove,
}: {
  item: ReviewItem;
  categories: Option[];
  members: Option[];
  onPatch: (idx: number, patch: ItemPatch) => void;
  onSelect: (idx: number, selected: boolean) => void;
  onRemove: (idx: number, removed: boolean) => void;
}) {
  if (item.kind === "CREDIT" || item.kind === "PAYMENT") return <ReadOnlyRow item={item} />;
  const k = `imp-${item.idx}`;
  if (item.removed) {
    return (
      <li
        data-testid="import-item"
        className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500"
      >
        <span className="min-w-0 break-words line-through">{item.description}</span>
        <Button variant="ghost" onClick={() => onRemove(item.idx, false)}>
          Restaurar
        </Button>
      </li>
    );
  }
  const selectable = canSelect(item);
  return (
    <li
      data-testid="import-item"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        isChosen(item) ? "border-brand-700" : "border-slate-200",
      )}
    >
      <div className="flex items-start gap-3">
        <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="size-5"
            aria-label={`Selecionar ${item.description}`}
            checked={isChosen(item)}
            disabled={!selectable}
            onChange={(e) => onSelect(item.idx, e.target.checked)}
          />
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Marks item={item} />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${k}-d`} className="text-xs font-medium text-slate-700">
              Descrição
            </label>
            <input
              id={`${k}-d`}
              className={inputClass}
              value={item.description}
              maxLength={100}
              onChange={(e) => onPatch(item.idx, { description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${k}-v`} className="text-xs font-medium text-slate-700">
                Valor
              </label>
              <MoneyInput
                id={`${k}-v`}
                value={Number(item.amountInCents ?? 0)}
                onChange={(c) => onPatch(item.idx, { amountInCents: String(c) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${k}-dt`} className="text-xs font-medium text-slate-700">
                Data
              </label>
              <input
                id={`${k}-dt`}
                type="date"
                className={inputClass}
                value={item.date ?? ""}
                onChange={(e) => onPatch(item.idx, { date: e.target.value || null })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${k}-c`} className="text-xs font-medium text-slate-700">
                Categoria
              </label>
              <select
                id={`${k}-c`}
                className={inputClass}
                value={item.categoryId ?? ""}
                aria-invalid={item.categoryId === null ? true : undefined}
                onChange={(e) => onPatch(item.idx, { categoryId: e.target.value || null })}
              >
                <option value="">Escolha…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${k}-p`} className="text-xs font-medium text-slate-700">
                Pagador
              </label>
              <select
                id={`${k}-p`}
                className={inputClass}
                value={item.payerMemberId}
                onChange={(e) => onPatch(item.idx, { payerMemberId: e.target.value })}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        className="self-end"
        aria-label={`Excluir ${item.description}`}
        onClick={() => onRemove(item.idx, true)}
      >
        Excluir
      </Button>
    </li>
  );
}
