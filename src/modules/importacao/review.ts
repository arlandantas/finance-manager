import type { ConfirmImportBody } from "./confirm-schema";
import { GROUPS, isItemSelectable } from "./groups";
import type { ImportDraft, ImportDraftItem } from "./schemas";
import { reconcileTotal } from "./total";

// US-067b (PURO, sem server-only): estado da revisão no cliente. UI não decide regra: usa as mesmas
// funções do servidor (`reconcileTotal`, `isItemSelectable`) sobre o rascunho recebido.
export type ReviewItem = ImportDraftItem & {
  /** Excluído da revisão (some da lista e da seleção; continua no total do arquivo). */
  removed: boolean;
  /** O membro corrigiu o item: dispensa a marca "Precisa de atenção" vinda do servidor. */
  reviewed: boolean;
};

export const toReviewItems = (items: ImportDraftItem[]): ReviewItem[] =>
  items.map((i) => ({ ...i, removed: false, reviewed: false }));

export const hasFlag = (i: ImportDraftItem, f: ImportDraftItem["flags"][number]) =>
  i.flags.includes(f);

/** Item importável incompleto: obriga o membro a corrigir (ou desmarcar) antes de confirmar. */
export function needsAttention(i: ReviewItem): boolean {
  if (i.kind !== "PURCHASE" && i.kind !== "FEE") return false;
  const incomplete =
    i.date === null ||
    i.categoryId === null ||
    i.amountInCents === null ||
    BigInt(i.amountInCents) <= 0n ||
    i.description.trim().length < 2;
  return incomplete || (hasFlag(i, "NEEDS_ATTENTION") && !i.reviewed);
}

export const canSelect = (i: ReviewItem): boolean => !i.removed && isItemSelectable(i);

export const isChosen = (i: ReviewItem): boolean => i.selected && canSelect(i);

export function draftTotals(items: readonly ReviewItem[], declared: ImportDraft["declared"]) {
  return reconcileTotal(
    items.map((i) => ({ kind: i.kind, amountInCents: i.amountInCents, selected: isChosen(i) })),
    declared.totalInCents ?? null,
  );
}

export const blockedItems = (items: readonly ReviewItem[]): ReviewItem[] =>
  items.filter((i) => isChosen(i) && needsAttention(i));

export const chosenCount = (items: readonly ReviewItem[]): number => items.filter(isChosen).length;

export type ConfirmBlock = "NONE_SELECTED" | "NEEDS_ATTENTION" | "ALREADY_IMPORTED_FILE" | null;

export function confirmBlock(items: readonly ReviewItem[], draft: ImportDraft): ConfirmBlock {
  if (draft.alreadyImportedAt) return "ALREADY_IMPORTED_FILE";
  if (chosenCount(items) === 0) return "NONE_SELECTED";
  if (blockedItems(items).length > 0) return "NEEDS_ATTENTION";
  return null;
}

/** Corpo da confirmação: `occurrence` volta como veio do rascunho, sem alteração (spec 13). */
export function buildConfirmBody(
  draft: ImportDraft,
  items: readonly ReviewItem[],
): ConfirmImportBody {
  return {
    importToken: draft.importToken,
    invoiceRef: draft.invoiceRef,
    items: items.filter(isChosen).map((i) => ({
      idx: i.idx,
      occurrence: i.occurrence,
      date: i.date as string,
      description: i.description.trim(),
      amountInCents: i.amountInCents as string,
      kind: i.kind as "PURCHASE" | "FEE",
      installment: i.installment,
      categoryId: i.categoryId as string,
      payerMemberId: i.payerMemberId,
    })),
  };
}

export type ItemGroup = { kind: ImportDraftItem["kind"]; label: string; items: ReviewItem[] };

const ORDER: ImportDraftItem["kind"][] = ["PURCHASE", "FEE", "CREDIT", "PAYMENT"];

/** Grupos na ordem da spec, só os que têm item. */
export function groupItems(items: readonly ReviewItem[]): ItemGroup[] {
  return ORDER.map((kind) => ({
    kind,
    label: GROUPS[kind],
    items: items.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0);
}
