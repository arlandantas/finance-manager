import { ApiClientError, NetworkError } from "@/lib/http";

const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

/** "2026-10-12T15:00:00.000Z" -> "12/10" (fuso de São Paulo). */
export function brDayMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE.format(d);
}

const AI_CODES = new Set([
  "AI_UNAVAILABLE",
  "AI_DISABLED",
  "LLM_UNAVAILABLE",
  "LLM_BUDGET_EXCEEDED",
  "LLM_ESTIMATE_EXCEEDS_BUDGET",
]);

/** `true` quando a falha é da IA (PDF indisponível): a tela convida a enviar o CSV. */
export const isAiFailure = (e: unknown): boolean =>
  e instanceof ApiClientError && (AI_CODES.has(e.code) || e.status === 404);

/** Mensagem amigável; nunca expõe código nem stack (docs/rules/frontend.md). */
export function importErrorMessage(e: unknown): string {
  if (e instanceof NetworkError) return e.message;
  if (!(e instanceof ApiClientError)) return "Erro inesperado. Tente novamente.";
  if (e.code === "IMPORT_ALREADY_EXISTS") {
    const at = (e.details as { importedAt?: string } | undefined)?.importedAt;
    const when = at ? brDayMonth(at) : "";
    return when ? `Este arquivo já foi importado em ${when}` : "Este arquivo já foi importado.";
  }
  if (e.status === 404) return "Indisponível: envie o CSV.";
  if (e.code === "AI_UNAVAILABLE" || e.code === "LLM_UNAVAILABLE")
    return "Indisponível: envie o CSV.";
  return e.message;
}
