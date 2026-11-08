import { describe, expect, it } from "vitest";
import { importErrorMessage } from "@/app/(app)/cartoes/[id]/importar/import-errors";
import { ApiClientError } from "@/lib/http";

const err = (status: number, code: string, message = "msg do servidor", details?: unknown) =>
  new ApiClientError(status, code, message, details);

describe("US-067b importErrorMessage", () => {
  it("PREVIEW_STALE, IMPORT_TOKEN_INVALID e INVOICE_PAID_LOCKED têm texto amigável", () => {
    expect(importErrorMessage(err(409, "PREVIEW_STALE"))).toMatch(/Envie de novo/);
    expect(importErrorMessage(err(422, "IMPORT_TOKEN_INVALID"))).toMatch(/expirou/);
    expect(importErrorMessage(err(422, "INVOICE_PAID_LOCKED"))).toMatch(/já foi paga/);
  });
  it("recusa de Só meu de outro titular mostra a mensagem do servidor", () => {
    const m = 'Um lançamento "Só meu" só pode ser em seu próprio nome.';
    expect(importErrorMessage(err(422, "VALIDATION_ERROR", m))).toBe(m);
  });
  it("IMPORT_ALREADY_EXISTS mostra a data; erro desconhecido não vaza detalhe", () => {
    expect(
      importErrorMessage(
        err(409, "IMPORT_ALREADY_EXISTS", "x", { importedAt: "2026-10-12T15:00:00Z" }),
      ),
    ).toBe("Este arquivo já foi importado em 12/10");
    expect(importErrorMessage(new Error("stack"))).toBe("Erro inesperado. Tente novamente.");
  });
});
