// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ConsentForm } from "@/app/oauth/consent/consent-form";

afterEach(cleanup);
const props = {
  requestId: "11111111-1111-4111-8111-111111111111",
  client: {
    verified: true as const,
    displayName: "Claude",
    domain: "claude.ai",
    redirectUrl: "https://claude.ai/api/mcp/auth_callback",
  },
  suggestedLabel: "Claude",
  wantsWrite: true,
  limitsText: "Até R$ 500,00 por lançamento · 10 por dia · 5 por hora",
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
    expect(screen.getByRole("link", { name: "Alterar limites" })).toHaveAttribute(
      "target",
      "_blank",
    );
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

  it("SEC-011: aviso fixo de 'só continue se você pediu' e URL completa de retorno", () => {
    render(<ConsentForm {...props} />);
    expect(screen.getByTestId("consent-warning")).toHaveTextContent(
      "Só continue se você acabou de pedir esta conexão no seu assistente, neste aparelho.",
    );
    expect(screen.getByTestId("redirect-url")).toHaveTextContent(
      "https://claude.ai/api/mcp/auth_callback",
    );
    expect(screen.getByTestId("verified-badge")).toHaveTextContent("Verificado");
  });

  it("SEC-011: cliente não verificado mostra aviso forte e exige 'Entendo o risco'", async () => {
    const user = userEvent.setup();
    const client = {
      verified: false as const,
      reportedName: "Banco Oficial",
      clientHost: "evil.example",
      redirectUrl: "https://evil.example/cb",
    };
    render(<ConsentForm {...props} client={client} suggestedLabel="Banco Oficial" />);
    expect(screen.getByRole("heading", { name: /não verificado/ })).toBeInTheDocument();
    expect(screen.getByText(/nome informado pelo próprio aplicativo/)).toBeInTheDocument();
    expect(screen.queryByTestId("verified-badge")).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Entendi" }));
    expect(screen.getByRole("button", { name: "Permitir" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Entendo o risco" }));
    expect(screen.getByRole("button", { name: "Permitir" })).toBeEnabled();
  });

  it("título com o cliente e destino; exige nome com 2+ caracteres", async () => {
    const user = userEvent.setup();
    render(<ConsentForm {...props} />);
    expect(
      screen.getByRole("heading", { name: "Claude quer acessar seus dados financeiros" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Claude (claude.ai)")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Entendi" }));
    const label = screen.getByLabelText("Nome da conexão");
    await user.clear(label);
    await user.type(label, "A");
    expect(screen.getByRole("button", { name: "Permitir" })).toBeDisabled();
  });
});
