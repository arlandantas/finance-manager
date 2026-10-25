import { ApiError } from "@/lib/api/errors";
import type { LlmErrorCode } from "@/modules/ia/port";

// SDD-021 §3: o detalhe do provedor nunca chega ao usuário.
export const NEUTRAL_LLM_MESSAGE = "Não foi possível usar a IA agora. Tente novamente em instantes";

/** `YYYY-MM-DD` ⇒ `dd/mm/aaaa`. */
export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const aiUnavailable = () =>
  new ApiError(503, "AI_UNAVAILABLE", "A IA ainda não está disponível");

/** SEC-013: teto GLOBAL atingido. Não revela que é o teto agregado nem quanto foi gasto. */
export const aiGloballyUnavailable = () =>
  new ApiError(
    503,
    "AI_UNAVAILABLE",
    "A análise com IA está indisponível no momento. Tente de novo mais tarde.",
  );

export const aiDisabled = (
  message = "A análise por IA está desligada nesta família",
  details?: Record<string, unknown>,
) => new ApiError(409, "AI_DISABLED", message, details);

export const budgetExceeded = (resetsOn: string) =>
  new ApiError(
    422,
    "LLM_BUDGET_EXCEEDED",
    `O limite de uso de IA deste mês foi atingido. Volta a liberar em ${brDate(resetsOn)}`,
    { resetsOn },
  );

export const estimateExceedsBudget = (resetsOn: string) =>
  new ApiError(
    422,
    "LLM_ESTIMATE_EXCEEDS_BUDGET",
    `Esta solicitação passaria do limite de uso de IA deste mês. Volta a liberar em ${brDate(resetsOn)}`,
    { resetsOn },
  );

export const purposeNotAvailable = () =>
  new ApiError(422, "PURPOSE_NOT_AVAILABLE", "Este recurso de IA ainda não está disponível");

/** Tradução fixa `LlmErrorCode` ⇒ erro HTTP (SDD-021 §3). */
export function toApiError(code: LlmErrorCode): ApiError {
  switch (code) {
    case "UNAVAILABLE":
    case "TIMEOUT":
    case "RATE_LIMITED":
    case "AUTH":
      return new ApiError(503, "LLM_UNAVAILABLE", NEUTRAL_LLM_MESSAGE);
    case "INVALID_RESPONSE":
    case "TRUNCATED":
    case "REFUSED":
      return new ApiError(502, "LLM_INVALID_RESPONSE", NEUTRAL_LLM_MESSAGE);
    case "CANCELLED":
      return new ApiError(499, "LLM_CANCELLED", "Pedido cancelado");
  }
}

export type LlmOutcome =
  | "ok"
  | "budget"
  | "timeout"
  | "unavailable"
  | "invalid"
  | "refused"
  | "cancelled"
  | "auth";

export function outcomeOf(code: LlmErrorCode): LlmOutcome {
  switch (code) {
    case "TIMEOUT":
      return "timeout";
    case "UNAVAILABLE":
    case "RATE_LIMITED":
      return "unavailable";
    case "INVALID_RESPONSE":
    case "TRUNCATED":
      return "invalid";
    case "REFUSED":
      return "refused";
    case "CANCELLED":
      return "cancelled";
    case "AUTH":
      return "auth";
  }
}
