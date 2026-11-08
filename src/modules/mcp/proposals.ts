import { ApiError, unprocessable } from "@/lib/api/errors";
import type { Tx } from "@/lib/api/types";
import { addDays, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { MAX_BACKDATE_DAYS } from "@/modules/mcp/assistant-write";
import type { McpContext } from "@/modules/mcp/context";
import {
  contentHashOf,
  MAX_PENDING_PER_GRANT,
  MAX_PROPOSALS_PER_HOUR,
  PROPOSAL_TTL_MIN,
  type ProposalDTO,
  type ProposalStatus,
} from "@/modules/mcp/proposals-schemas";
import { sanitizeUserText } from "@/modules/mcp/tools/user-text";
import { CreateExpenseSchema } from "@/modules/transacoes/schemas";

// US-076c: o pedido do assistente, numa conexão com "exigir confirmação", só cria uma PROPOSTA.
export type ProposeInput = {
  description: string;
  amountInCents: number;
  categoryId: string;
  accountId?: string | undefined;
  cardId?: string | undefined;
  occurredOn?: string | undefined;
  idempotencyKey?: string | undefined;
};

type Row = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED";
  expiresAt: Date;
};

/** Estado efetivo: pendente vencida já é "expirada", mesmo antes de a varredura gravar. */
export const effectiveStatus = (p: Row, now: Date): ProposalStatus =>
  p.status === "PENDING" && p.expiresAt <= now ? "EXPIRED" : p.status;

/** Expiração preguiçosa: grava EXPIRED nas pendentes vencidas do membro. */
export async function sweepExpired(tx: Tx, familyId: string, memberId: string, now: Date) {
  await tx.assistantProposal.updateMany({
    where: { familyId, memberId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", decidedAt: now },
  });
}

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

export type ProposeOutput = {
  proposalId: string;
  status: ProposalStatus;
  expiresAt: Date;
  amount: number;
  duplicate: boolean;
};

export async function proposeExpense(
  tx: Tx,
  ctx: McpContext,
  input: ProposeInput,
): Promise<ProposeOutput> {
  if (!ctx.requireConfirmation) {
    throw unprocessable("CONFIRMATION_MODE_OFF", "Esta conexão lança direto: use lancar_despesa.");
  }
  // mesma trava de `lancar_despesa`: propostas e lançamentos do membro ficam serializados
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-write:${ctx.memberId}`}, 0))`;
  const now = ctx.clock.now();
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const description = sanitizeUserText(input.description, 100);
  const hash = contentHashOf({ ...input, description, occurredOn });
  await sweepExpired(tx, ctx.familyId, ctx.memberId, now);

  if (input.idempotencyKey) {
    const same = await tx.assistantProposal.findUnique({
      where: {
        grantId_idempotencyKey: { grantId: ctx.grantId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (same) {
      if (same.contentHash !== hash) {
        throw unprocessable("IDEMPOTENCY_KEY_REUSED", "Esta chave já foi usada com outro pedido");
      }
      return {
        proposalId: same.id,
        status: effectiveStatus(same, now),
        expiresAt: same.expiresAt,
        amount: toCents(same.amountInCents),
        duplicate: true,
      };
    }
  }

  if (occurredOn > today || occurredOn < addDays(today, -MAX_BACKDATE_DAYS)) {
    throw unprocessable(
      "DATE_OUT_OF_RANGE",
      `data fora do prazo permitido (de hoje até ${MAX_BACKDATE_DAYS} dias atrás)`,
    );
  }
  // mesma validação de forma do app; as referências são conferidas de novo ao confirmar
  CreateExpenseSchema.parse({
    type: "EXPENSE",
    amountInCents: input.amountInCents,
    categoryId: input.categoryId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.cardId ? { cardId: input.cardId } : {}),
    occurredOn,
    description,
    isSharedExpense: false,
    installments: 1,
  });
  const where = { familyId: ctx.familyId, archivedAt: null };
  const category = await tx.category.findFirst({
    where: { ...where, id: input.categoryId, kind: "EXPENSE" },
    select: { id: true },
  });
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  if (input.accountId) {
    const a = await tx.bankAccount.findFirst({
      where: { ...where, id: input.accountId },
      select: { id: true },
    });
    if (!a) throw invalidRef("accountId", "Escolha uma conta");
  }
  if (input.cardId) {
    const c = await tx.creditCard.findFirst({
      where: { ...where, id: input.cardId },
      select: { id: true },
    });
    if (!c) throw invalidRef("cardId", "Escolha um cartão");
  }

  // limites de propostas por conexão (mais restritos que o transporte)
  const pending = await tx.assistantProposal.count({
    where: { grantId: ctx.grantId, status: "PENDING", expiresAt: { gt: now } },
  });
  if (pending >= MAX_PENDING_PER_GRANT) {
    throw new LimitError(
      `Há ${MAX_PENDING_PER_GRANT} propostas pendentes. Peça ao usuário para confirmar ou recusar no app antes de propor outra.`,
    );
  }
  const lastHour = await tx.assistantProposal.count({
    where: { grantId: ctx.grantId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
  });
  if (lastHour >= MAX_PROPOSALS_PER_HOUR) {
    throw new LimitError("Limite de propostas por hora atingido. Tente novamente mais tarde.");
  }

  const row = await tx.assistantProposal.create({
    data: {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      grantId: ctx.grantId,
      idempotencyKey: input.idempotencyKey ?? null,
      contentHash: hash,
      description,
      amountInCents: BigInt(input.amountInCents),
      categoryId: input.categoryId,
      accountId: input.accountId ?? null,
      cardId: input.cardId ?? null,
      occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MIN * 60_000),
      createdAt: now,
    },
  });
  return {
    proposalId: row.id,
    status: "PENDING",
    expiresAt: row.expiresAt,
    amount: input.amountInCents,
    duplicate: false,
  };
}

class LimitError extends ApiError {
  constructor(message: string) {
    super(422, "LIMIT_EXCEEDED", message);
  }
}

/** DTO de proposta (tela e ferramenta de consulta). Resolve nomes agora. */
export async function toProposalDTO(
  tx: Tx,
  familyId: string,
  p: {
    id: string;
    status: "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED";
    description: string;
    amountInCents: bigint;
    occurredOn: Date;
    categoryId: string;
    accountId: string | null;
    cardId: string | null;
    grantId: string;
    createdAt: Date;
    expiresAt: Date;
    decidedAt: Date | null;
    transactionId: string | null;
  },
  now: Date,
): Promise<ProposalDTO> {
  const [category, account, card, grant] = await Promise.all([
    tx.category.findFirst({ where: { id: p.categoryId, familyId }, select: { name: true } }),
    p.accountId
      ? tx.bankAccount.findFirst({ where: { id: p.accountId, familyId }, select: { name: true } })
      : null,
    p.cardId
      ? tx.creditCard.findFirst({ where: { id: p.cardId, familyId }, select: { name: true } })
      : null,
    tx.mcpGrant.findFirst({ where: { id: p.grantId, familyId }, select: { label: true } }),
  ]);
  return {
    id: p.id,
    status: effectiveStatus(p, now),
    description: p.description,
    amountInCents: toCents(p.amountInCents),
    occurredOn: fromDbDate(p.occurredOn),
    category: { id: p.categoryId, name: category?.name ?? "" },
    source: p.cardId
      ? { kind: "card", id: p.cardId, name: card?.name ?? "" }
      : { kind: "account", id: p.accountId ?? "", name: account?.name ?? "" },
    assistantLabel: grant?.label ?? "Assistente",
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null,
    transactionId: p.transactionId,
  };
}
