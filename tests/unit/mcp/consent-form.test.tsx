// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ConsentForm } from "@/app/oauth/consent/consent-form";

afterEach(cleanup);
const props = {
  requestId: "11111111-1111-4111-8111-111111111111",
  clientName: "Claude",
  redirectHost: "claude.ai",
  redirectIsLoopback: false,
  knownHost: true,
  wantsWrite: true,
};

describe("EN-006a tela de consentimento (SDD-025 §4.1/§8.1)", () => {
  it("Permitir fica desabilitado até marcar 'Entendi'; escrita exige a segunda ciência", async () => {
    const user = userEvent.setup();
    render(<ConsentForm {...props} />);
    const allow = screen.getByRole("button", { name: "Permitir" });
    expect(allow).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Entendi" }));
    expect(allow).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /Lançar despesas em seu nome/ }));
    expect(allow).toBeDisabled();
    expect(screen.getByText(/R\$ 500,00 por lançamento/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /sem minha confirmação/ }));
    expect(allow).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /Lançar despesas em seu nome/ }));
    expect(allow).toBeEnabled();
  });

  it("sem write pedido não oferece lançamento; leitura é fixa", () => {
    render(<ConsentForm {...props} wantsWrite={false} />);
    expect(screen.queryByText(/Lançar despesas/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Consultar saldos/ })).toBeDisabled();
  });

  it("avisos: loopback e host desconhecido", () => {
    const { rerender } = render(<ConsentForm {...props} redirectIsLoopback />);
    expect(screen.getByText(/roda no seu computador/)).toBeInTheDocument();
    rerender(<ConsentForm {...props} knownHost={false} />);
    expect(screen.getByText("Aplicativo não reconhecido")).toBeInTheDocument();
    rerender(<ConsentForm {...props} />);
    expect(screen.queryByText("Aplicativo não reconhecido")).toBeNull();
  });

  it("título com o cliente e destino; exige nome com 2+ caracteres", async () => {
    const user = userEvent.setup();
    render(<ConsentForm {...props} />);
    expect(
      screen.getByRole("heading", { name: "Claude quer acessar seus dados financeiros" }),
    ).toBeInTheDocument();
    expect(screen.getByText("claude.ai")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Entendi" }));
    const label = screen.getByLabelText("Nome da conexão");
    await user.clear(label);
    await user.type(label, "A");
    expect(screen.getByRole("button", { name: "Permitir" })).toBeDisabled();
  });
});
