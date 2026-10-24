import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeLlmAdapter } from "@/modules/ia/fake-adapter";
import { LlmError } from "@/modules/ia/port";

const schema = z.object({ summary: z.string() }).strict();
const req = (signal = new AbortController().signal) => ({
  purpose: "SPENDING_ANALYSIS" as const,
  system: "sys",
  input: '{"a":1}',
  outputSchema: schema,
  maxOutputTokens: 256,
  model: "claude-haiku-5-5",
  effort: "low" as const,
  signal,
});
const fixtures = {
  SPENDING_ANALYSIS: {
    ok: { summary: "ok" },
    invalid_json: "{nao-e-json",
    schema_violation: { summary: 1 },
  },
};

describe("EN-004 FakeLlmAdapter", () => {
  it("devolve a fixture validada, usage fixo e registra a chamada", async () => {
    const fake = new FakeLlmAdapter({ fixtures });
    const r = await fake.generate(req());
    expect(r.data).toEqual({ summary: "ok" });
    expect(r.usage).toEqual({ inputTokens: 3000, outputTokens: 1500, model: "claude-haiku-5-5" });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.input).toBe('{"a":1}');
  });

  it("fixture inválida de propósito vira INVALID_RESPONSE", async () => {
    for (const scenario of ["invalid_json", "schema_violation"] as const) {
      const fake = new FakeLlmAdapter({ fixtures, scenario });
      await expect(fake.generate(req())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("cenários de falha lançam o LlmError correspondente", async () => {
    const map = {
      unavailable: "UNAVAILABLE",
      timeout: "TIMEOUT",
      rate_limited: "RATE_LIMITED",
      truncated: "TRUNCATED",
      refusal: "REFUSED",
    } as const;
    for (const [scenario, code] of Object.entries(map)) {
      const fake = new FakeLlmAdapter({ fixtures, scenario: scenario as keyof typeof map });
      await expect(fake.generate(req())).rejects.toMatchObject({ code });
    }
  });

  it("respeita o signal", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(new FakeLlmAdapter({ fixtures }).generate(req(ac.signal))).rejects.toBeInstanceOf(
      LlmError,
    );
    const ac2 = new AbortController();
    const slow = new FakeLlmAdapter({ fixtures, delayMs: 5000 });
    const p = slow.generate(req(ac2.signal));
    ac2.abort();
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
  });
});

describe("EN-004 sem rede", () => {
  it("fetch para api.anthropic.com falha imediatamente", () => {
    expect(() => fetch("https://api.anthropic.com/v1/messages")).toThrow(/bloqueada/);
  });
});
