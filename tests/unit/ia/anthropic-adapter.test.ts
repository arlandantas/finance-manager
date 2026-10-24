// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicLlmAdapter } from "@/modules/ia/anthropic-adapter";

// Contrato do adapter com `fetch` injetado (HTTP simulado, sem rede e sem chave real).
const schema = z.object({ summary: z.string() }).strict();
const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: '{"summary":"ok"}' }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
  ...over,
});
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function make(handler: (req: Request) => Response | Promise<Response>, maxRetries = 0) {
  const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push({ url: req.url, body: JSON.parse(await req.clone().text()) });
    return handler(req);
  }) as typeof fetch;
  const adapter = new AnthropicLlmAdapter({
    apiKey: "chave-de-teste",
    timeoutMs: 5000,
    maxRetries,
    fetch: f,
    baseURL: "http://anthropic.invalid",
  });
  return { adapter, seen };
}
const req = (signal = new AbortController().signal) => ({
  purpose: "SPENDING_ANALYSIS" as const,
  system: "sys fixo",
  input: '{"x":1}',
  outputSchema: schema,
  maxOutputTokens: 256,
  model: "claude-haiku-5-5",
  effort: "low" as const,
  signal,
});

describe("EN-004 AnthropicLlmAdapter (contrato HTTP simulado)", () => {
  it("sucesso: devolve dado validado e usage; corpo sem tools/tool_choice/thinking", async () => {
    const { adapter, seen } = make(() => json(200, message()));
    const r = await adapter.generate(req());
    expect(r.data).toEqual({ summary: "ok" });
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 20, model: "claude-haiku-5-5" });
    const body = seen[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).not.toHaveProperty("thinking");
    expect(body.system).toBe("sys fixo");
    expect(body.max_tokens).toBe(256);
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(body.messages).toEqual([{ role: "user", content: '{"x":1}' }]);
  });

  it("stop_reason max_tokens ⇒ TRUNCATED (com usage); refusal ⇒ REFUSED", async () => {
    const t = make(() => json(200, message({ stop_reason: "max_tokens" })));
    await expect(t.adapter.generate(req())).rejects.toMatchObject({
      code: "TRUNCATED",
      usage: { outputTokens: 20 },
    });
    const r = make(() => json(200, message({ stop_reason: "refusal" })));
    await expect(r.adapter.generate(req())).rejects.toMatchObject({ code: "REFUSED" });
  });

  it("JSON inválido ou fora do schema ⇒ INVALID_RESPONSE", async () => {
    for (const text of ["não é json", '{"summary":1}', '{"summary":"a","extra":1}']) {
      const m = make(() => json(200, message({ content: [{ type: "text", text }] })));
      await expect(m.adapter.generate(req())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("429 ⇒ RATE_LIMITED, 500 ⇒ UNAVAILABLE, 401 ⇒ AUTH, sem vazar a mensagem do provedor", async () => {
    const err = (status: number) =>
      json(status, { type: "error", error: { type: "x", message: "segredo do provedor" } });
    const cases: Array<[number, string]> = [
      [429, "RATE_LIMITED"],
      [500, "UNAVAILABLE"],
      [401, "AUTH"],
      [403, "AUTH"],
    ];
    for (const [status, code] of cases) {
      const m = make(() => err(status));
      const e = await m.adapter.generate(req()).catch((x) => x);
      expect(e.code).toBe(code);
      expect(e.message).toBe(code);
    }
  });

  it("timeout ⇒ TIMEOUT; abort do chamador ⇒ CANCELLED", async () => {
    const hang = (r: Request) =>
      new Promise<Response>((_, reject) =>
        r.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    const adapter = new AnthropicLlmAdapter({
      apiKey: "k",
      timeoutMs: 1000,
      maxRetries: 0,
      baseURL: "http://anthropic.invalid",
      fetch: ((i: string | URL | Request, init?: RequestInit) =>
        hang(new Request(i, init))) as typeof fetch,
    });
    await expect(adapter.generate(req())).rejects.toMatchObject({ code: "TIMEOUT" });
    const ac = new AbortController();
    const p = adapter.generate(req(ac.signal));
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toMatchObject({ code: "CANCELLED" });
  }, 10_000);

  it("uma retentativa em 500 transitório (maxRetries 1)", async () => {
    let n = 0;
    const m = make(
      () =>
        ++n === 1 ? json(500, { type: "error", error: { message: "x" } }) : json(200, message()),
      1,
    );
    await expect(m.adapter.generate(req())).resolves.toMatchObject({ data: { summary: "ok" } });
    expect(n).toBe(2);
  }, 10_000);
});
