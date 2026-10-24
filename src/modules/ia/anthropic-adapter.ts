import Anthropic, {
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { z } from "zod";
import { LlmError, type LlmPort, type LlmRequest, type LlmUsage } from "@/modules/ia/port";

// SDD-021 §4.1 / ADR-028: ÚNICO arquivo que importa o SDK (regra `llm-sdk-import` do check:imports).
// Sem `tools`, sem `tool_choice`, sem `thinking`: a IA só devolve dados validados por nós.

export type AnthropicAdapterOptions = {
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  /** Só para o teste de contrato (HTTP local simulado, sem rede). */
  fetch?: typeof fetch;
  baseURL?: string;
};

export class AnthropicLlmAdapter implements LlmPort {
  private readonly client: Anthropic;

  constructor(opts: AnthropicAdapterOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      logLevel: "off", // o log do SDK pode conter cabeçalhos/corpo (ADR-028 §6)
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  async generate<T>(req: LlmRequest<T>): Promise<{ data: T; usage: LlmUsage; attempts?: number }> {
    let res: Anthropic.Message;
    try {
      res = await this.client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          output_config: {
            effort: req.effort,
            format: { type: "json_schema", schema: z.toJSONSchema(req.outputSchema) },
          },
          system: req.system, // estável (sem timestamp) ⇒ elegível a cache do provedor
          messages: [{ role: "user", content: req.input }],
        },
        { signal: req.signal },
      );
    } catch (e) {
      throw translateError(e);
    }
    const usage: LlmUsage = {
      inputTokens:
        res.usage.input_tokens +
        (res.usage.cache_creation_input_tokens ?? 0) +
        (res.usage.cache_read_input_tokens ?? 0),
      outputTokens: res.usage.output_tokens,
      model: res.model,
    };
    if (res.stop_reason === "max_tokens") throw new LlmError("TRUNCATED", usage);
    if (res.stop_reason === "refusal") throw new LlmError("REFUSED", usage);
    if (res.stop_reason !== "end_turn") throw new LlmError("INVALID_RESPONSE", usage);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmError("INVALID_RESPONSE", usage);
    }
    const parsed = req.outputSchema.safeParse(json);
    if (!parsed.success) throw new LlmError("INVALID_RESPONSE", usage);
    return { data: parsed.data, usage };
  }
}

/** Tradução por classe do SDK, nunca por mensagem (a mensagem bruta pode conter dados). */
export function translateError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof APIUserAbortError) return new LlmError("CANCELLED");
  if (e instanceof APIConnectionTimeoutError) return new LlmError("TIMEOUT");
  if (e instanceof RateLimitError) return new LlmError("RATE_LIMITED");
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) {
    return new LlmError("AUTH");
  }
  return new LlmError("UNAVAILABLE");
}
