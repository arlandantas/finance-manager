import { z } from "zod";
import { amountInCentsSchema, formatBRL } from "@/lib/money";
import { versionSchema } from "@/lib/schemas";

// SDD-027 §R2.3: limites de lançamento do assistente, por MEMBRO. `null` = sem limite.
/** Padrões sugeridos (D-GES-37): valem desde o primeiro lançamento, antes de qualquer configuração. */
export const DEFAULT_ASSISTANT_LIMITS = {
  maxAmountPerTxCents: 50_000,
  maxTxPerDay: 10,
  maxTxPerHour: 5,
} as const;

export const RISK_NOT_ACK_MESSAGE = "Confirme que entendeu o risco de remover ou aumentar o limite";

export const AssistantLimitsSchema = z
  .object({
    maxAmountPerTxCents: amountInCentsSchema.nullable(),
    maxTxPerDay: z.number().int().min(1).max(200).nullable(),
    maxTxPerHour: z.number().int().min(1).max(60).nullable(),
    /** Ausente só quando ainda não existe linha (primeiro salvamento). */
    version: versionSchema.optional(),
    /** Obrigatório `true` se algum campo ficar sem limite ou acima do padrão. */
    riskAcknowledged: z.boolean().default(false),
  })
  .strict();
export type AssistantLimitsInput = z.input<typeof AssistantLimitsSchema>;
export type AssistantLimitsParsed = z.output<typeof AssistantLimitsSchema>;

export type AssistantLimitsDTO = {
  maxAmountPerTxCents: number | null;
  maxTxPerDay: number | null;
  maxTxPerHour: number | null;
  defaults: { maxAmountPerTxCents: number; maxTxPerDay: number; maxTxPerHour: number };
  isDefault: boolean;
  version: number | null;
  /** Lançamentos via assistente do membro (inclusive excluídos): para a tela. */
  usage: { today: number; lastHour: number };
};

/** Algum campo ficou sem limite ou acima do padrão? (exige "Entendi o risco") */
export function isRiskier(l: {
  maxAmountPerTxCents: number | null;
  maxTxPerDay: number | null;
  maxTxPerHour: number | null;
}): boolean {
  return (
    l.maxAmountPerTxCents === null ||
    l.maxTxPerDay === null ||
    l.maxTxPerHour === null ||
    l.maxAmountPerTxCents > DEFAULT_ASSISTANT_LIMITS.maxAmountPerTxCents ||
    l.maxTxPerDay > DEFAULT_ASSISTANT_LIMITS.maxTxPerDay ||
    l.maxTxPerHour > DEFAULT_ASSISTANT_LIMITS.maxTxPerHour
  );
}

/** Texto dos limites vigentes para a tela de consentimento (SDD-025 §8.1). */
export function describeLimits(l: {
  maxAmountPerTxCents: number | null;
  maxTxPerDay: number | null;
  maxTxPerHour: number | null;
}): string {
  if (l.maxAmountPerTxCents === null && l.maxTxPerDay === null && l.maxTxPerHour === null) {
    return "Sem limite";
  }
  const amount =
    l.maxAmountPerTxCents === null
      ? "sem limite de valor"
      : `até ${formatBRL(l.maxAmountPerTxCents).replace(/\u00a0/g, " ")} por lançamento`;
  const day = l.maxTxPerDay === null ? "sem limite por dia" : `${l.maxTxPerDay} por dia`;
  const hour = l.maxTxPerHour === null ? "sem limite por hora" : `${l.maxTxPerHour} por hora`;
  const text = `${amount} · ${day} · ${hour}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
