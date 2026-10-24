import type { z } from "zod";

// SDD-021 §2 / ADR-028 §1: a única porta de saída para o LLM. Sem ferramentas: a IA só devolve dados.

export type LlmPurpose = "SPENDING_ANALYSIS" | "INVOICE_IMPORT";
export type LlmUsage = { inputTokens: number; outputTokens: number; model: string };

export type LlmRequest<T> = {
  purpose: LlmPurpose;
  /** Prompt fixo da finalidade (versionado no código). */
  system: string;
  /** JSON do payload JÁ validado (ADR-029); vai num bloco de usuário. */
  input: string;
  /** Validado AQUI (o adapter chama `outputSchema.safeParse`). */
  outputSchema: z.ZodType<T>;
  maxOutputTokens: number;
  model: string;
  effort: "low" | "medium" | "high";
  signal: AbortSignal;
};

export interface LlmPort {
  generate<T>(req: LlmRequest<T>): Promise<{ data: T; usage: LlmUsage; attempts?: number }>;
}

export type LlmErrorCode =
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_RESPONSE"
  | "TRUNCATED"
  | "REFUSED"
  | "CANCELLED"
  | "AUTH";

/** Erro traduzido do provedor. Nunca carrega a mensagem bruta do provedor (pode conter dados). */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    readonly usage?: LlmUsage,
  ) {
    super(code);
    this.name = "LlmError";
  }
}
