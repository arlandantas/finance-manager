import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { uuidSchema } from "@/lib/schemas";
import type { ConnectionStatus } from "@/modules/mcp/connections-schemas";

// SDD-027 §5 (+ §R2.6): atividade do assistente. UM evento = UM item (sem par proposta/confirmação).
export type ActivityOutcome =
  | "OK"
  | "DENIED_SCOPE"
  | "INVALID"
  | "RATE_LIMITED"
  | "ERROR"
  | "LIMIT_EXCEEDED";

export type LimitField = "maxAmountPerTxCents" | "maxTxPerDay" | "maxTxPerHour";

export type ActivityItemDTO = {
  id: string;
  at: string;
  assistant: { grantId: string | null; label: string };
  kind: "TOOL" | "CONNECTED" | "REVOKED" | "BLOCKED" | "LIMITS_CHANGED";
  tool: string | null;
  /** "Consultou saldos", "Lançou despesa", "Você alterou…" (sem valores devolvidos). */
  toolLabel: string;
  /** Período/filtros consultados, com nomes resolvidos na leitura: "nov/2026 · Supermercado". */
  scopeText: string | null;
  outcome: ActivityOutcome;
  outcomeLabel: string;
  /** Lançamento do próprio membro (dado dele, não o conteúdo devolvido à IA). */
  transaction: {
    id: string;
    description: string;
    amountInCents: number;
    occurredOn: string;
    deleted: boolean;
  } | null;
  /** Só `LIMITS_CHANGED`: `null` = sem limite. */
  limitChange: { field: LimitField; from: number | null; to: number | null } | null;
};

export type ActivityResponse = {
  items: ActivityItemDTO[];
  nextCursor: string | null;
  assistants: Array<{ grantId: string; label: string; status: ConnectionStatus }>;
};

export const ActivityQuerySchema = z
  .object({
    grantId: uuidSchema.optional(),
    /** Atalhos de período calculados no servidor (o relógio do app é o do servidor). */
    range: z.enum(["7d", "30d", "month"]).optional(),
    from: dateISOSchema.optional(),
    to: dateISOSchema.optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();
export type ActivityQuery = z.output<typeof ActivityQuerySchema>;
