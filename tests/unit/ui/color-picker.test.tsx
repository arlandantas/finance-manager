// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ColorPicker } from "@/components/color-picker";
import { SourceBadge } from "@/components/source-badge";
import { ACCOUNT_COLOR_LABEL, ACCOUNT_COLORS, type AccountColor } from "@/modules/contas/colors";

afterEach(cleanup);

function Harness({ initial = "BLUE" as AccountColor }) {
  const [v, setV] = useState<AccountColor>(initial);
  return <ColorPicker value={v} onChange={setV} />;
}

describe("US-050 SourceBadge", () => {
  it("ponto decorativo (aria-hidden, data-color) + nome em texto, sem estilo inline", () => {
    const { container } = render(<SourceBadge color="ORANGE" name="Itaú Mariana" />);
    expect(screen.getByText("Itaú Mariana")).toBeTruthy();
    const dot = container.querySelector(".source-dot") as HTMLElement;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.getAttribute("data-color")).toBe("ORANGE");
    expect(dot.getAttribute("style")).toBeNull();
    expect(screen.getByTestId("source-badge").getAttribute("data-color")).toBe("ORANGE");
  });
});

describe("US-050 ColorPicker (seletor acessível)", () => {
  it("radiogroup com 10 opções, cada uma com o NOME falado", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Cor" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    for (const c of ACCOUNT_COLORS) {
      expect(screen.getByRole("radio", { name: ACCOUNT_COLOR_LABEL[c] })).toBeTruthy();
    }
  });

  it("selecionada: aria-checked e texto 'Cor: Laranja (selecionada)'", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Azul" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Laranja" }));
    expect(screen.getByRole("radio", { name: "Laranja" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("radio", { name: "Azul" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Cor: Laranja (selecionada)")).toBeTruthy();
  });

  it("setas movem a seleção (e voltam ao início no fim da paleta)", () => {
    render(<Harness initial="BROWN" />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Marrom" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Azul" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Azul" }), { key: "ArrowLeft" });
    expect(screen.getByText("Cor: Marrom (selecionada)")).toBeTruthy();
  });

  it("repetir a cor de outra conta não gera aviso (RN-017.4)", () => {
    render(<Harness initial="GREEN" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
