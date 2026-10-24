// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectDialog } from "@/app/(app)/configuracoes/assistente/connect-dialog";

afterEach(cleanup);

describe("US-074 instruções de conexão (SDD-025 §4.2, §8.3)", () => {
  it("mostra a URL e os passos só do Claude; nada de segredo nem de outros assistentes", () => {
    render(<ConnectDialog open onOpenChange={() => {}} mcpUrl="https://app.exemplo.com/api/mcp" />);
    expect(screen.getByTestId("mcp-url")).toHaveTextContent("https://app.exemplo.com/api/mcp");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Claude (web, Desktop e celular)");
    expect(text).toContain(
      "claude mcp add --transport http financas https://app.exemplo.com/api/mcp",
    );
    for (const w of ["ChatGPT", "Gemini", "fma_", "fmr_"]) expect(text).not.toContain(w);
    expect(screen.getByRole("button", { name: "Copiar endereço" })).toBeEnabled();
  });
});
