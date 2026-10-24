import { badRequest, conflict } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { addDays, todayInFamilyTz } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import { recordAudit } from "@/modules/mcp/audit";
import {
  type AssistantLimitsDTO,
  type AssistantLimitsParsed,
  DEFAULT_ASSISTANT_LIMITS,
  isRiskier,
  RISK_NOT_ACK_MESSAGE,
} from "@/modules/mcp/limits-schemas";

// SDD-027 §R2.3: leitura, gravação e contagem dos limites de lançamento do assistente (por membro).
export type EffectiveLimits = {
  maxAmountPerTxCents: number | null;
  maxTxPerDay: number | null;
  maxTxPerHour: number | null;
};

type Row = {
  maxAmountPerTxCents: bigint | null;
  maxTxPerDay: number | null;
  maxTxPerHour: number | null;
  version: number;
};

/** Sem linha ⇒ padrões sugeridos. */
export async function effectiveLimits(
  tx: Tx,
  familyId: string,
  memberId: string,
): Promise<EffectiveLimits & { version: number | null }> {
  const row: Row | null = await tx.memberAssistantLimits.findUnique({
    where: { familyId_memberId: { familyId, memberId } },
  });
  if (!row) return { ...DEFAULT_ASSISTANT_LIMITS, version: null };
  return {
    maxAmountPerTxCents: row.maxAmountPerTxCents === null ? null : toCents(row.maxAmountPerTxCents),
    maxTxPerDay: row.maxTxPerDay,
    maxTxPerHour: row.maxTxPerHour,
    version: row.version,
  };
}

/** Janela do dia da família: [00:00, 24:00) no fuso (sem horário de verão). */
export function familyDayWindow(ctx: Pick<RequestContext, "clock">): { start: Date; end: Date } {
  const today = todayInFamilyTz(ctx.clock);
  return {
    start: new Date(`${today}T00:00:00-03:00`),
    end: new Date(`${addDays(today, 1)}T00:00:00-03:00`),
  };
}

/** Lançamentos via assistente do membro, INCLUSIVE excluídos (excluir não devolve a cota). */
export async function assistantUsage(
  tx: Tx,
  ctx: RequestContext,
): Promise<{ today: number; lastHour: number }> {
  const now = ctx.clock.now();
  const { start, end } = familyDayWindow(ctx);
  const base = {
    familyId: ctx.familyId,
    authorMemberId: ctx.memberId,
    origin: "ASSISTANT" as const,
  };
  const [today, lastHour] = await Promise.all([
    tx.transaction.count({ where: { ...base, createdAt: { gte: start, lt: end } } }),
    tx.transaction.count({
      where: { ...base, createdAt: { gt: new Date(now.getTime() - 3_600_000), lte: now } },
    }),
  ]);
  return { today, lastHour };
}

export async function getAssistantLimits(tx: Tx, ctx: RequestContext): Promise<AssistantLimitsDTO> {
  const l = await effectiveLimits(tx, ctx.familyId, ctx.memberId);
  return {
    maxAmountPerTxCents: l.maxAmountPerTxCents,
    maxTxPerDay: l.maxTxPerDay,
    maxTxPerHour: l.maxTxPerHour,
    defaults: { ...DEFAULT_ASSISTANT_LIMITS },
    isDefault:
      l.maxAmountPerTxCents === DEFAULT_ASSISTANT_LIMITS.maxAmountPerTxCents &&
      l.maxTxPerDay === DEFAULT_ASSISTANT_LIMITS.maxTxPerDay &&
      l.maxTxPerHour === DEFAULT_ASSISTANT_LIMITS.maxTxPerHour,
    version: l.version,
    usage: await assistantUsage(tx, ctx),
  };
}

const FIELDS = ["maxAmountPerTxCents", "maxTxPerDay", "maxTxPerHour"] as const;

/**
 * PUT /assistant/limits: `upsert` com versão. Cada campo alterado gera um evento `LIMITS_CHANGED`
 * (os valores são configuração do membro, não dado financeiro devolvido: SDD-027 §R2.1).
 */
export async function putAssistantLimits(
  tx: Tx,
  ctx: RequestContext,
  input: AssistantLimitsParsed,
): Promise<AssistantLimitsDTO> {
  if (isRiskier(input) && !input.riskAcknowledged) {
    throw badRequest("RISK_NOT_ACKNOWLEDGED", RISK_NOT_ACK_MESSAGE);
  }
  // serializa gravações do mesmo membro
  const rows = await tx.$queryRaw<Array<{ version: number }>>`
    SELECT version FROM member_assistant_limits
    WHERE "familyId" = ${ctx.familyId}::uuid AND "memberId" = ${ctx.memberId}::uuid FOR UPDATE`;
  const existing = rows[0];
  if (existing && input.version !== existing.version) {
    throw conflict("VERSION_CONFLICT", "Os limites foram alterados. Recarregue para continuar.");
  }
  if (!existing && input.version !== undefined) {
    throw conflict("VERSION_CONFLICT", "Os limites foram alterados. Recarregue para continuar.");
  }
  const before = await effectiveLimits(tx, ctx.familyId, ctx.memberId);
  const data = {
    maxAmountPerTxCents:
      input.maxAmountPerTxCents === null ? null : fromCents(input.maxAmountPerTxCents),
    maxTxPerDay: input.maxTxPerDay,
    maxTxPerHour: input.maxTxPerHour,
  };
  if (existing) {
    await tx.memberAssistantLimits.update({
      where: { familyId_memberId: { familyId: ctx.familyId, memberId: ctx.memberId } },
      data: { ...data, version: { increment: 1 } },
    });
  } else {
    await tx.memberAssistantLimits.create({
      data: { familyId: ctx.familyId, memberId: ctx.memberId, ...data },
    });
  }
  const now = ctx.clock.now();
  for (const field of FIELDS) {
    if (before[field] === input[field]) continue;
    await recordAudit(tx, {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      grantId: null,
      clientName: "Configurações",
      kind: "LIMITS_CHANGED",
      params: { field, from: before[field] ?? "none", to: input[field] ?? "none" },
      outcome: "OK",
      at: now,
    });
  }
  return getAssistantLimits(tx, ctx);
}
