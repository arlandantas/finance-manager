import { describe, expect, it } from "vitest";
import {
  blockedItems,
  buildConfirmBody,
  confirmBlock,
  draftTotals,
  groupItems,
  type ReviewItem,
  toReviewItems,
} from "@/modules/importacao/review";
import type { ImportDraft, ImportDraftItem } from "@/modules/importacao/schemas";

const CAT = "11111111-1111-4111-8111-111111111111";
const PAYER = "22222222-2222-4222-8222-222222222222";

const item = (o: Partial<ImportDraftItem> & { idx: number }): ImportDraftItem => ({
  occurrence: 1,
  date: "2026-10-12",
  description: "MERCADO",
  amountInCents: "1000",
  kind: "PURCHASE",
  installment: null,
  selected: true,
  group: "Compras",
  categoryId: CAT,
  payerMemberId: PAYER,
  flags: [],
  ...o,
});

const draft = (items: ImportDraftItem[], total?: string): ImportDraft => ({
  importToken: "tok",
  source: "CSV",
  fileHash: "a".repeat(64),
  invoiceRef: "2026-10",
  declared: total ? { totalInCents: total } : {},
  items,
  totals: { itemsTotal: "0", selectedTotal: "0", difference: "0" },
  warnings: [],
});

describe("US-067b review (puro)", () => {
  it("agrupa na ordem da spec e omite grupos vazios", () => {
    const items = toReviewItems([
      item({ idx: 0, kind: "PAYMENT" }),
      item({ idx: 1 }),
      item({ idx: 2, kind: "FEE", selected: false }),
    ]);
    expect(groupItems(items).map((g) => g.label)).toEqual([
      "Compras",
      "Encargos",
      "Pagamento da fatura",
    ]);
  });

  it("recalcula selecionados e diferença com reconcileTotal ao desmarcar/editar", () => {
    const base = toReviewItems([item({ idx: 0 }), item({ idx: 1, amountInCents: "500" })]);
    expect(draftTotals(base, { totalInCents: "1500" })).toMatchObject({
      itemsTotal: 1500n,
      selectedTotal: 1500n,
      difference: 0n,
    });
    const unticked = base.map((i) => (i.idx === 1 ? { ...i, selected: false } : i));
    expect(draftTotals(unticked, { totalInCents: "1500" }).selectedTotal).toBe(1000n);
    const edited = base.map((i) => (i.idx === 1 ? { ...i, amountInCents: "700" } : i));
    expect(draftTotals(edited, { totalInCents: "1500" }).difference).toBe(-200n);
  });

  it("duplicado possível pode ser marcado; já importado/lançada não conta mesmo marcado", () => {
    const items = toReviewItems([
      item({ idx: 0, selected: false, flags: ["POSSIBLE_DUPLICATE"] }),
      item({ idx: 1, flags: ["ALREADY_IMPORTED"] }),
      item({ idx: 2, flags: ["ALREADY_POSTED_PARCEL"] }),
    ]);
    const marked = items.map((i) => (i.idx === 0 ? { ...i, selected: true } : i));
    expect(buildConfirmBody(draft([]), marked).items.map((i) => i.idx)).toEqual([0]);
  });

  it("precisa de atenção selecionado bloqueia até corrigir ou desmarcar", () => {
    const d = draft([item({ idx: 0, categoryId: null, flags: ["NEEDS_ATTENTION"] })]);
    let items: ReviewItem[] = toReviewItems(d.items);
    expect(blockedItems(items)).toHaveLength(1);
    expect(confirmBlock(items, d)).toBe("NEEDS_ATTENTION");
    items = items.map((i) => ({ ...i, categoryId: CAT, reviewed: true }));
    expect(confirmBlock(items, d)).toBeNull();
    items = toReviewItems(d.items).map((i) => ({ ...i, selected: false }));
    expect(confirmBlock(items, d)).toBe("NONE_SELECTED");
  });

  it("corpo devolve occurrence sem alterar e só itens escolhidos", () => {
    const d = draft([item({ idx: 0, occurrence: 2 }), item({ idx: 1, selected: false })]);
    const body = buildConfirmBody(d, toReviewItems(d.items));
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ idx: 0, occurrence: 2, amountInCents: "1000" });
  });

  it("arquivo já importado bloqueia tudo", () => {
    const d = { ...draft([item({ idx: 0 })]), alreadyImportedAt: "2026-10-12T15:00:00.000Z" };
    expect(confirmBlock(toReviewItems(d.items), d)).toBe("ALREADY_IMPORTED_FILE");
  });
});
