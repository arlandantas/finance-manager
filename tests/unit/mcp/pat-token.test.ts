import { describe, expect, it } from "vitest";
import { LOG_REDACT_PATHS } from "@/lib/logger";
import { CreatePatSchema, redactPatBody } from "@/modules/mcp/pat";
import {
  BEARER_REGEX,
  hashesEqual,
  hashToken,
  newTokenValue,
  PAT_REGEX,
} from "@/modules/mcp/tokens";

describe("token pessoal: formato e hash (ADR-043)", () => {
  it("fmp_ + 43 caracteres base64url (256 bits), único e com hash sha256 hex", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { value, hash } = newTokenValue("PAT");
      expect(value).toMatch(PAT_REGEX);
      expect(value).toHaveLength(47);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(hashToken(value));
      expect(value).not.toContain(hash);
      seen.add(value);
    }
    expect(seen.size).toBe(200);
  });

  it("regex recusa formatos errados; bearer aceita só fma_/fmp_", () => {
    const ok = `fmp_${"a".repeat(43)}`;
    expect(PAT_REGEX.test(ok)).toBe(true);
    for (const bad of [
      `fmp_${"a".repeat(42)}`,
      `fmp_${"a".repeat(44)}`,
      `fmp_${"+".repeat(43)}`,
      `fmx_${"a".repeat(43)}`,
      ` ${ok}`,
      `${ok}\n`,
    ]) {
      expect(PAT_REGEX.test(bad)).toBe(false);
    }
    expect(BEARER_REGEX.test(`fma_${"a".repeat(43)}`)).toBe(true);
    expect(BEARER_REGEX.test(`fmr_${"a".repeat(43)}`)).toBe(false);
    expect(BEARER_REGEX.test(`fmc_${"a".repeat(43)}`)).toBe(false);
  });

  it("comparação em tempo constante", () => {
    expect(hashesEqual(hashToken("a"), hashToken("a"))).toBe(true);
    expect(hashesEqual(hashToken("a"), hashToken("b"))).toBe(false);
    expect(hashesEqual("abc", "abcd")).toBe(false);
  });

  it("contrato de criação: padrão 30 dias, saneia o nome, exige ciência e é estrito", () => {
    expect(CreatePatSchema.parse({ label: "  Meu\u0000 CLI ​" })).toEqual({
      label: "Meu CLI",
      validityDays: 30,
    });
    for (const d of [7, 30, 90])
      expect(CreatePatSchema.safeParse({ label: "x", validityDays: d }).success).toBe(true);
    for (const d of [0, 1, 15, 91, "30"])
      expect(CreatePatSchema.safeParse({ label: "x", validityDays: d }).success).toBe(false);
    expect(CreatePatSchema.safeParse({ label: "x", allowWrite: true }).success).toBe(false);
    expect(
      CreatePatSchema.safeParse({ label: "x", allowWrite: true, writeAcknowledged: true }).success,
    ).toBe(true);
    expect(CreatePatSchema.safeParse({ label: "x".repeat(41) }).success).toBe(false);
    expect(CreatePatSchema.safeParse({ label: "x", extra: 1 }).success).toBe(false);
  });

  it("idempotência guarda a conexão sem o token; logger mascara *.token", () => {
    expect(redactPatBody({ connection: { id: "1" }, token: "fmp_segredo" })).toEqual({
      connection: { id: "1" },
      tokenRedacted: true,
    });
    expect(LOG_REDACT_PATHS).toContain("*.token");
  });
});
