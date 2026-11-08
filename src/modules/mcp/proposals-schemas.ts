import { createHash } from "node:crypto";
import { z } from "zod";

// US-076c (ADR-030 §6): contratos da proposta de lançamento. O assistente só PROPÕE; quem confirma é o membro, no app.
export const PROPOSAL_TTL_MIN = 30;
export const MAX_PENDING_PER_GRANT = 10;
export const MAX_PROPOSALS_PER_HOUR = 20;
/** Propostas não confirmadas (recusadas, expiradas ou esquecidas) são apagadas após 30 dias. */
export const PROPOSAL_RETENTION_DAYS = 30;

export type ProposalStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED";

export type ProposalDTO = {
  id: string;
  status: ProposalStatus;
  description: string;
  amountInCents: number;
  occurredOn: string;
  category: { id: string; name: string };
  source: { kind: "account" | "card"; id: string; name: string };
  /** Nome da conexão que fez o pedido. */
  assistantLabel: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  transactionId: string | null;
};

export type ConfirmProposalResult = {
  proposal: ProposalDTO;
  /** `true` quando a proposta já estava confirmada (segunda confirmação não cria outro lançamento). */
  alreadyConfirmed: boolean;
};

export const EmptyBodySchema = z.object({}).strict();

export const SetConfirmationSchema = z
  .object({ requireConfirmation: z.boolean(), riskAcknowledged: z.literal(true).optional() })
  .strict();
export type SetConfirmationInput = z.infer<typeof SetConfirmationSchema>;

export const PROPOSAL_EXPIRED_MESSAGE =
  "A proposta expirou. Peça ao assistente para propor de novo.";
export const PROPOSAL_REJECTED_MESSAGE = "A proposta foi recusada.";

/** Descrição normalizada para comparar conteúdo (NFKC, sem espaços nas pontas, sem caixa). */
const norm = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");

/** Impressão do conteúdo da proposta: chave reutilizada com outro pedido é erro. */
export function contentHashOf(p: {
  description: string;
  amountInCents: number;
  categoryId: string;
  accountId?: string | undefined;
  cardId?: string | undefined;
  occurredOn: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        norm(p.description),
        p.amountInCents,
        p.categoryId,
        p.cardId ? `card:${p.cardId}` : `account:${p.accountId}`,
        p.occurredOn,
      ]),
    )
    .digest("hex");
}
