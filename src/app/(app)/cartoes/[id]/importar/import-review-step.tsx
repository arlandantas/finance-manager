"use client";

import { useRef, useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { newIdempotencyKey } from "@/lib/http";
import type { ConfirmImportBody } from "@/modules/importacao/confirm-schema";
import {
  buildConfirmBody,
  chosenCount,
  confirmBlock,
  draftTotals,
  groupItems,
  type ReviewItem,
  toReviewItems,
} from "@/modules/importacao/review";
import type { ImportDraft } from "@/modules/importacao/schemas";
import { brDayMonth } from "./import-errors";
import { ImportItemRow, type ItemPatch, type Option } from "./import-item-row";

const BLOCK_HINT = {
  NONE_SELECTED: "Selecione ao menos um item para importar.",
  NEEDS_ATTENTION: "Corrija ou desmarque os itens que precisam de atenção.",
  ALREADY_IMPORTED_FILE: "Este arquivo já foi importado: nada pode ser selecionado.",
} as const;

export function ImportReviewStep({
  draft,
  categories,
  members,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  draft: ImportDraft;
  categories: Option[];
  members: Option[];
  pending: boolean;
  error: string | null;
  /** `key` é estável enquanto o corpo não muda (reenvio da mesma tentativa). */
  onConfirm: (body: ConfirmImportBody, key: string) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>(() => toReviewItems(draft.items));
  const attempt = useRef<{ sig: string; key: string } | null>(null);
  const update = (idx: number, fn: (i: ReviewItem) => ReviewItem) =>
    setItems((all) => all.map((i) => (i.idx === idx ? fn(i) : i)));
  const patch = (idx: number, p: ItemPatch) => update(idx, (i) => ({ ...i, ...p, reviewed: true }));

  const totals = draftTotals(items, draft.declared);
  const declared = draft.declared.totalInCents;
  const block = confirmBlock(items, draft);
  const mismatch = declared !== undefined && totals.difference !== 0n;

  function submit() {
    const body = buildConfirmBody(draft, items);
    const sig = JSON.stringify(body);
    if (attempt.current?.sig !== sig) attempt.current = { sig, key: newIdempotencyKey() };
    onConfirm(body, attempt.current.key);
  }

  return (
    <div className="flex flex-col gap-4">
      {draft.alreadyImportedAt ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Este arquivo já foi importado em {brDayMonth(draft.alreadyImportedAt)}
        </p>
      ) : null}
      {draft.warnings
        .filter((w) => w.code !== "TOTAL_MISMATCH" && w.code !== "FILE_ALREADY_IMPORTED")
        .map((w) => (
          <p
            key={w.code}
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {w.message}
          </p>
        ))}
      <section
        aria-label="Conferência do total"
        className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:bg-slate-100"
      >
        {declared !== undefined ? (
          <div>
            <p className="text-slate-600">Total do arquivo</p>
            <p data-testid="import-declared" className="font-semibold">
              <Money cents={Number(declared)} />
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-slate-600">Soma dos itens</p>
          <p data-testid="import-items-total" className="font-semibold">
            <Money cents={Number(totals.itemsTotal)} />
          </p>
        </div>
        <div>
          <p className="text-slate-600">Selecionados</p>
          <p data-testid="import-selected-total" className="font-semibold">
            <Money cents={Number(totals.selectedTotal)} />
          </p>
        </div>
        {declared !== undefined ? (
          <div>
            <p className="text-slate-600">Diferença</p>
            <p data-testid="import-difference" className="font-semibold">
              <Money cents={Number(totals.difference)} />
            </p>
          </div>
        ) : null}
        {mismatch ? (
          <p role="status" className="col-span-2 text-amber-900">
            O total do arquivo não bate com a soma dos itens. Confira antes de confirmar.
          </p>
        ) : null}
      </section>
      <p className="text-sm text-slate-600">
        Os itens entram como "Só meu", com o titular do cartão como pagador, e não alteram o acerto.
      </p>
      {groupItems(items).map((g) => (
        <section key={g.kind} aria-label={g.label} className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">{g.label}</h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((i) => (
              <ImportItemRow
                key={i.idx}
                item={i}
                categories={categories}
                members={members}
                onPatch={patch}
                onSelect={(idx, selected) => update(idx, (x) => ({ ...x, selected }))}
                onRemove={(idx, removed) => update(idx, (x) => ({ ...x, removed }))}
              />
            ))}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-white py-3 dark:bg-slate-100">
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {block ? <p className="text-sm text-slate-600">{BLOCK_HINT[block]}</p> : null}
        <Button disabled={block !== null || pending} onClick={submit}>
          {pending
            ? "Importando…"
            : `Confirmar ${chosenCount(items)} ${chosenCount(items) === 1 ? "item" : "itens"}`}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
