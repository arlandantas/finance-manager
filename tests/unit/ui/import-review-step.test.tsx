// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportReviewStep } from "@/app/(app)/cartoes/[id]/importar/import-review-step";
import { PrefsProvider, resetPrefsMemory, writePref } from "@/lib/prefs";
import type { ImportDraft, ImportDraftItem } from "@/modules/importacao/schemas";

const CAT = "11111111-1111-4111-8111-111111111111";
const PAYER = "22222222-2222-4222-8222-222222222222";

const item = (o: Partial<ImportDraftItem> & { idx: number }): ImportDraftItem => ({
  occurrence: 1,
  date: "2026-10-12",
  description: `Item ${o.idx}`,
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

const draftOf = (items: ImportDraftItem[], total = "2000"): ImportDraft => ({
  importToken: "tok",
  source: "CSV",
  fileHash: "a".repeat(64),
  invoiceRef: "2026-10",
  declared: { totalInCents: total },
  items,
  totals: { itemsTotal: "0", selectedTotal: "0", difference: "0" },
  warnings: [],
});

function renderStep(d: ImportDraft, onConfirm = vi.fn()) {
  render(
    <PrefsProvider userId="u1">
      <ImportReviewStep
        draft={d}
        categories={[{ id: CAT, name: "Mercado" }]}
        members={[{ id: PAYER, name: "Lucas" }]}
        pending={false}
        error={null}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />
    </PrefsProvider>,
  );
  return onConfirm;
}

beforeEach(() => {
  window.localStorage.clear();
  resetPrefsMemory();
  writePref("u1", "hideValues", false);
});
afterEach(cleanup);

const text = (id: string) => screen.getByTestId(id).textContent?.replace(/\s/g, " ");

describe("US-067b ImportReviewStep", () => {
  it("mostra os grupos e as marcas", () => {
    renderStep(
      draftOf([
        item({ idx: 0 }),
        item({ idx: 1, kind: "FEE", selected: false }),
        item({ idx: 2, kind: "CREDIT" }),
        item({ idx: 3, flags: ["ALREADY_IMPORTED"] }),
        item({ idx: 4, selected: false, flags: ["POSSIBLE_DUPLICATE"], duplicateOf: CAT }),
      ]),
    );
    for (const g of ["Compras", "Encargos", "Estornos e créditos"]) {
      expect(screen.getByRole("heading", { name: g })).toBeTruthy();
    }
    expect(screen.getByText("Já importado")).toBeTruthy();
    expect(screen.getByText(/Possível duplicado/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ver lançamento" }).getAttribute("href")).toBe(
      `/extrato?highlight=${CAT}`,
    );
  });

  it("desmarcar e editar o valor atualizam Selecionados e a diferença na hora", () => {
    renderStep(draftOf([item({ idx: 0 }), item({ idx: 1 })]));
    expect(text("import-selected-total")).toContain("20,00");
    expect(text("import-difference")).toContain("0,00");
    fireEvent.click(screen.getByLabelText("Selecionar Item 1"));
    expect(text("import-selected-total")).toContain("10,00");
    fireEvent.change(document.getElementById("imp-0-v") as HTMLInputElement, {
      target: { value: "1500" },
    });
    expect(text("import-selected-total")).toContain("15,00");
    expect(text("import-difference")).toContain("5,00");
  });

  it("já importado não pode ser marcado; possível duplicado pode", () => {
    renderStep(
      draftOf([
        item({ idx: 0, flags: ["ALREADY_IMPORTED"] }),
        item({ idx: 1, selected: false, flags: ["POSSIBLE_DUPLICATE"] }),
      ]),
    );
    const imported = screen.getByLabelText("Selecionar Item 0") as HTMLInputElement;
    expect(imported.disabled).toBe(true);
    expect(imported.checked).toBe(false);
    const dup = screen.getByLabelText("Selecionar Item 1") as HTMLInputElement;
    expect(dup.disabled).toBe(false);
    fireEvent.click(dup);
    expect(dup.checked).toBe(true);
  });

  it("precisa de atenção selecionado bloqueia Confirmar até corrigir ou desmarcar", () => {
    const onConfirm = renderStep(
      draftOf([item({ idx: 0, categoryId: null, flags: ["NEEDS_ATTENTION"] })], "1000"),
    );
    const btn = screen.getByRole("button", { name: /Confirmar/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: CAT } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0]?.[0].items[0]).toMatchObject({ idx: 0, occurrence: 1 });
  });

  it("reenvio sem mudança mantém a Idempotency-Key; mudança gera outra", () => {
    const onConfirm = renderStep(draftOf([item({ idx: 0 }), item({ idx: 1 })]));
    const btn = screen.getByRole("button", { name: /Confirmar/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    const [first, second] = onConfirm.mock.calls;
    expect(second?.[1]).toBe(first?.[1]);
    fireEvent.click(screen.getByLabelText("Selecionar Item 1"));
    fireEvent.click(btn);
    expect(onConfirm.mock.calls[2]?.[1]).not.toBe(first?.[1]);
  });

  it("excluir tira o item da seleção e Restaurar o devolve", () => {
    renderStep(draftOf([item({ idx: 0 }), item({ idx: 1 })]));
    fireEvent.click(screen.getByRole("button", { name: "Excluir Item 1" }));
    expect(text("import-selected-total")).toContain("10,00");
    const row = screen.getAllByTestId("import-item")[1] as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Restaurar" }));
    expect(text("import-selected-total")).toContain("20,00");
  });
});
