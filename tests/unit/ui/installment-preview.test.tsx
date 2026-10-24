import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { InstallmentPreviewText } from "@/components/installment-preview";
import { PrefsProvider, resetPrefsMemory, writePref } from "@/lib/prefs";

const ui = (total: number, count: number, purchaseOn = "2026-11-10", paidBeforeApp = 0) => (
  <PrefsProvider userId="u1">
    <InstallmentPreviewText
      totalInCents={total}
      count={count}
      purchaseOn={purchaseOn}
      closingDay={25}
      paidBeforeApp={paidBeforeApp}
    />
  </PrefsProvider>
);

beforeEach(() => {
  window.localStorage.clear();
  resetPrefsMemory();
  writePref("u1", "hideValues", false);
});

describe("US-040a prévia das parcelas", () => {
  it("valores iguais: 10x de R$ 250,00 · 1ª na fatura de nov/2026", () => {
    const { getByTestId } = render(ui(250000, 10));
    expect(getByTestId("installment-preview").textContent?.replace(/\s+/g, " ")).toBe(
      "10x de R$ 250,00 · 1ª na fatura de nov/2026",
    );
  });
  it("com centavos: 1ª de … + 2x de …", () => {
    const { getByTestId } = render(ui(100001, 3));
    expect(getByTestId("installment-preview").textContent?.replace(/\s+/g, " ")).toBe(
      "1ª de R$ 333,35 + 2x de R$ 333,33 · 1ª na fatura de nov/2026",
    );
  });
  it("depois do fechamento a 1ª vai para a fatura seguinte", () => {
    const { getByTestId } = render(ui(250000, 10, "2026-11-28"));
    expect(getByTestId("installment-preview").textContent).toContain("fatura de dez/2026");
  });
  it("oculto: nenhum dígito de valor aparece", () => {
    writePref("u1", "hideValues", true);
    const { getByTestId } = render(ui(250000, 10));
    expect(getByTestId("installment-preview").textContent).not.toMatch(/250/);
  });
  it("US-065: com 4 pagas, mostra o saldo restante e a próxima parcela", () => {
    const { getByTestId } = render(ui(250000, 10, "2026-11-10", 4));
    expect(getByTestId("installment-preview").textContent?.replace(/\s+/g, " ")).toBe(
      "Restam 6 parcelas de R$ 250,00 · a próxima (5/10) na fatura de nov/2026",
    );
  });
  it("US-065: resta 1 parcela", () => {
    const { getByTestId } = render(ui(250000, 10, "2026-11-10", 9));
    expect(getByTestId("installment-preview").textContent?.replace(/\s+/g, " ")).toBe(
      "Resta 1 parcela de R$ 250,00 · (10/10) na fatura de nov/2026",
    );
  });
  it("US-065: avisa que o resto de centavos ficou na 1ª, já paga", () => {
    const { getByTestId } = render(ui(100001, 3, "2026-11-10", 1));
    expect(getByTestId("installment-preview-remainder").textContent).toBe(
      "A diferença de centavos ficou na 1ª parcela, já paga",
    );
  });
  it("US-065: sem resto, não mostra o aviso", () => {
    const { queryByTestId } = render(ui(250000, 10, "2026-11-10", 4));
    expect(queryByTestId("installment-preview-remainder")).toBeNull();
  });
});
