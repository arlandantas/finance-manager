import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { recordAudit } from "@/modules/mcp/audit";
import { assertWithinLimits, assistantUsage, effectiveLimits } from "@/modules/mcp/limits";
import { effectiveStatus, sweepExpired, toProposalDTO } from "@/modules/mcp/proposals";
import {
  type ConfirmProposalResult,
  PROPOSAL_EXPIRED_MESSAGE,
  PROPOSAL_REJECTED_MESSAGE,
  type ProposalDTO,
} from "@/modules/mcp/proposals-schemas";
import { CreateExpenseSchema } from "@/modules/transacoes/schemas";
import { createExpenseCore } from "@/modules/transacoes/service";

// US-076c: confirmar ou recusar NO APP (sessão do membro). Não existe ferramenta MCP que decida.
const NOT_FOUND = "Proposta não encontrada.";

/** Trava do membro (a mesma de `lancar_despesa`) + linha da proposta FOR UPDATE; de outro membro/família ⇒ 404. */
async function lockProposal(tx: Tx, ctx: RequestContext, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-write:${ctx.memberId}`}, 0))`;
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM assistant_proposals WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "memberId" = ${ctx.memberId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound(NOT_FOUND);
  return tx.assistantProposal.findFirstOrThrow({ where: { id, familyId: ctx.familyId } });
}

async function grantInfo(tx: Tx, familyId: string, grantId: string) {
  const g = await tx.mcpGrant.findFirstOrThrow({
    where: { id: grantId, familyId },
    include: { client: { select: { clientName: true } } },
  });
  return { grant: g, clientName: g.client?.clientName ?? g.label };
}

/** GET /assistant/proposals/:id — só o dono; grava a expiração se já venceu. */
export async function getProposal(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ proposal: ProposalDTO }> {
  const row = await tx.assistantProposal.findFirst({
    where: { id, familyId: ctx.familyId, memberId: ctx.memberId },
  });
  if (!row) throw notFound(NOT_FOUND);
  const now = ctx.clock.now();
  await sweepExpired(tx, ctx.familyId, ctx.memberId, now);
  const fresh = await tx.assistantProposal.findFirstOrThrow({ where: { id } });
  return { proposal: await toProposalDTO(tx, ctx.familyId, fresh, now) };
}

/** POST /assistant/proposals/:id/confirm. */
export async function confirmProposal(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<ConfirmProposalResult> {
  const p = await lockProposal(tx, ctx, id);
  const now = ctx.clock.now();
  const done = async (alreadyConfirmed: boolean, row = p) => ({
    proposal: await toProposalDTO(tx, ctx.familyId, row, now),
    alreadyConfirmed,
  });
  if (p.status === "CONFIRMED") return done(true);
  if (p.status === "REJECTED") throw conflict("PROPOSAL_REJECTED", PROPOSAL_REJECTED_MESSAGE);
  if (effectiveStatus(p, now) === "EXPIRED") {
    throw conflict("PROPOSAL_EXPIRED", PROPOSAL_EXPIRED_MESSAGE);
  }
  const { grant, clientName } = await grantInfo(tx, ctx.familyId, p.grantId);
  if (grant.status !== "ACTIVE" || grant.expiresAt <= now) {
    throw conflict("CONNECTION_INACTIVE", "A conexão do assistente não está mais ativa.");
  }

  // limites do membro (US-076b): a contagem inclui o que já foi lançado pelo assistente
  const amountInCents = toCents(p.amountInCents);
  assertWithinLimits(
    await effectiveLimits(tx, ctx.familyId, ctx.memberId),
    await assistantUsage(tx, ctx),
    amountInCents,
  );
  if (todayInFamilyTz(ctx.clock) < fromDbDate(p.occurredOn)) {
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", "A data da compra não pode ser futura");
  }

  // o MESMO núcleo do app: cartão arquivado, fatura paga etc. falham com a mensagem do domínio
  const parsed = CreateExpenseSchema.parse({
    type: "EXPENSE",
    amountInCents,
    categoryId: p.categoryId,
    ...(p.accountId ? { accountId: p.accountId } : {}),
    ...(p.cardId ? { cardId: p.cardId } : {}),
    occurredOn: fromDbDate(p.occurredOn),
    description: p.description,
    isSharedExpense: false,
    installments: 1,
  });
  const created = await createExpenseCore(tx, ctx, parsed, {
    assistant: { grantId: p.grantId, idemKey: null, label: grant.label },
  });
  const transactionId = created.transaction.id;
  await tx.transaction.updateMany({
    where: { id: transactionId, familyId: ctx.familyId },
    data: { assistantProposalId: p.id },
  });
  const updated = await tx.assistantProposal.update({
    where: { id: p.id },
    data: { status: "CONFIRMED", decidedAt: now, transactionId },
  });
  await recordAudit(tx, {
    familyId: ctx.familyId,
    memberId: ctx.memberId,
    grantId: p.grantId,
    clientName,
    kind: "TOOL",
    tool: "confirmacao_no_app",
    params: { proposalId: p.id },
    outcome: "OK",
    transactionId,
    proposalId: p.id,
    at: now,
  });
  return done(false, updated);
}

/** POST /assistant/proposals/:id/reject. */
export async function rejectProposal(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ proposal: ProposalDTO }> {
  const p = await lockProposal(tx, ctx, id);
  const now = ctx.clock.now();
  const show = async (row = p) => ({ proposal: await toProposalDTO(tx, ctx.familyId, row, now) });
  if (p.status === "REJECTED") return show();
  if (p.status === "CONFIRMED") {
    throw conflict(
      "PROPOSAL_ALREADY_CONFIRMED",
      "A proposta já foi confirmada e virou lançamento.",
    );
  }
  if (effectiveStatus(p, now) === "EXPIRED") {
    throw conflict("PROPOSAL_EXPIRED", PROPOSAL_EXPIRED_MESSAGE);
  }
  const updated = await tx.assistantProposal.update({
    where: { id: p.id },
    data: { status: "REJECTED", decidedAt: now },
  });
  const { clientName } = await grantInfo(tx, ctx.familyId, p.grantId);
  await recordAudit(tx, {
    familyId: ctx.familyId,
    memberId: ctx.memberId,
    grantId: p.grantId,
    clientName,
    kind: "TOOL",
    tool: "recusa_no_app",
    params: { proposalId: p.id },
    outcome: "OK",
    proposalId: p.id,
    at: now,
  });
  return show(updated);
}
