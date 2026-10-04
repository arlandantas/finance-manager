import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

function setup(props: Partial<React.ComponentProps<typeof OnboardingFlow>> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingFlow
        userName="Mariana Silva"
        userImage={null}
        suggestedName="Família Silva"
        notice={null}
        {...props}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("US-002 Nome sugerido (componente)", () => {
  it("o campo vem preenchido com a sugestão e com foco", () => {
    setup();
    const input = screen.getByLabelText("Nome da família");
    expect(input).toHaveValue("Família Silva");
    expect(input).toHaveFocus();
  });
});

describe("US-002 Nome inválido (componente)", () => {
  it("mostra a mensagem e não chama a API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    setup({ suggestedName: "" });
    await user.click(screen.getByRole("button", { name: "Criar família" }));
    expect(
      await screen.findByText("Informe um nome com pelo menos 2 caracteres"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da família")).toHaveAttribute("aria-invalid", "true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("US-002 Duplo clique não duplica (componente)", () => {
  it("duas tentativas rápidas enviam uma única requisição, com Idempotency-Key", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole("button", { name: "Criar família" });
    await user.dblClick(button);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    resolveFetch(
      new Response(
        JSON.stringify({
          family: { id: "f", name: "Família Silva" },
          member: { id: "m", role: "ADMIN" },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    expect(await screen.findByText("Família Silva criada!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fazer depois" })).toBeInTheDocument();
  });

  it("falha de rede preserva o nome e reaproveita a mesma chave no reenvio", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            family: { id: "f", name: "Família Silva" },
            member: { id: "m", role: "ADMIN" },
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Criar família" }));
    expect(
      await screen.findByText("Sem conexão. Seus dados continuam na tela, tente de novo."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da família")).toHaveValue("Família Silva");
    await user.click(screen.getByRole("button", { name: "Criar família" }));
    await screen.findByText("Família Silva criada!");
    const keys = fetchSpy.mock.calls.map(
      (c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys[0]).toBe(keys[1]);
  });
});
