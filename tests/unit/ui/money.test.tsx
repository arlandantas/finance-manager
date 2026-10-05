import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MONEY_MASK, Money, maskMoneyInText, REVEAL_MS } from "@/components/money";
import { PrefsProvider, resetPrefsMemory, writePref } from "@/lib/prefs";

const ui = (cents: number, signed = false) => (
  <PrefsProvider userId="u1">
    <Money cents={cents} signed={signed} />
  </PrefsProvider>
);

beforeEach(() => {
  window.localStorage.clear();
  resetPrefsMemory();
});
afterEach(() => vi.useRealTimers());

describe("US-027 Money", () => {
  it("oculto por padrão: máscara visual e 'valor oculto' para leitor de tela", () => {
    render(ui(734950));
    expect(screen.getByRole("img", { name: "valor oculto" })).toBeInTheDocument();
    expect(screen.getByText(MONEY_MASK)).toHaveAttribute("aria-hidden", "true");
    expect(document.body.textContent).not.toMatch(/\d/);
  });

  it("visível: formata em reais; negativo mantém o sinal; signed acrescenta +", () => {
    writePref("u1", "hideValues", false);
    const { rerender } = render(ui(734950));
    expect(screen.getByText("R$ 7.349,50")).toBeInTheDocument();
    rerender(ui(-25890));
    expect(screen.getByText("-R$ 258,90")).toBeInTheDocument();
    rerender(ui(1000, true));
    expect(screen.getByText("+R$ 10,00")).toBeInTheDocument();
  });

  it("máscara não revela o sinal nem a ordem de grandeza", () => {
    const { container, rerender } = render(ui(-5));
    const a = container.textContent;
    rerender(ui(99999999));
    expect(container.textContent).toBe(a);
  });

  it("tocar revela por 5 s e volta a ocultar", () => {
    vi.useFakeTimers();
    render(ui(15050));
    fireEvent.click(screen.getByRole("img", { name: "valor oculto" }));
    expect(screen.getByText("R$ 150,50")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS - 1);
    });
    expect(screen.getByText("R$ 150,50")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByRole("img", { name: "valor oculto" })).toBeInTheDocument();
  });

  it("desmontar limpa o timer", () => {
    vi.useFakeTimers();
    const { unmount } = render(ui(15050));
    fireEvent.click(screen.getByRole("img", { name: "valor oculto" }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clique revela sem propagar para o elemento pai (linha clicável)", () => {
    const onRow = vi.fn();
    render(
      <PrefsProvider userId="u1">
        <div onClick={onRow}>
          <Money cents={100} />
        </div>
      </PrefsProvider>,
    );
    fireEvent.click(screen.getByRole("img", { name: "valor oculto" }));
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe("US-027 maskMoneyInText", () => {
  it("troca valores em reais pela máscara e preserva o resto", () => {
    expect(maskMoneyInText("O valor não pode ser maior que o devido (R$ 400,00)")).toBe(
      `O valor não pode ser maior que o devido (${MONEY_MASK})`,
    );
    expect(maskMoneyInText("saldo -R$ 1.234.567,89 e R$ 5,00")).toBe(
      `saldo ${MONEY_MASK} e ${MONEY_MASK}`,
    );
  });
  it("não toca percentuais, datas nem quantidades", () => {
    const t = "75% em 10/10/2026 com 3 compras";
    expect(maskMoneyInText(t)).toBe(t);
  });
  it("aviso de conta negativa já é texto sem valor", () => {
    expect(maskMoneyInText("A conta de origem ficará negativa")).toBe(
      "A conta de origem ficará negativa",
    );
  });
});
