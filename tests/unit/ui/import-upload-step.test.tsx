// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportUploadStep } from "@/app/(app)/cartoes/[id]/importar/import-upload-step";
import { PrefsProvider } from "@/lib/prefs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pdfResponse = {
  source: "PDF",
  lines: [{ ref: "L1", text: "12/10 MERCADO 10,00" }],
  previewHash: "a".repeat(64),
};

async function sendPdf(feature: Parameters<typeof ImportUploadStep>[0]["feature"]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(pdfResponse), { status: 200 })),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PrefsProvider userId="u1">
        <ImportUploadStep
          cardId="c1"
          refs={[{ ref: "2026-10" }]}
          initialRef="2026-10"
          feature={feature}
          isAdmin={false}
          onDraft={() => undefined}
        />
      </PrefsProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Arquivo da fatura (PDF ou CSV)"), {
    target: { files: [new File(["%PDF-"], "f.pdf")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
}

describe("US-067b ImportUploadStep (IA)", () => {
  it("configurações da IA ausentes: mostra Indisponível e nunca habilita a extração", async () => {
    await sendPdf(undefined);
    await waitFor(() => expect(screen.getByText("Indisponível: envie o CSV.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Extrair com IA" })).toBeNull();
  });

  it("consentimento ligado: mostra o aviso e habilita Extrair com IA", async () => {
    await sendPdf({
      purpose: "INVOICE_IMPORT",
      available: true,
      state: "ON",
      currentText: { version: 1, summary: "resumo", details: [] },
      lastChange: null,
    });
    await waitFor(() =>
      expect(screen.getByText("O conteúdo destas linhas vai à Anthropic (EUA)")).toBeTruthy(),
    );
    expect(
      (screen.getByRole("button", { name: "Extrair com IA" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
