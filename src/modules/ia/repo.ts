import type { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { decideBudget, RESERVATION_TTL_MS } from "@/modules/ia/budget";
import { aiMonthKey, resetsOn } from "@/modules/ia/month";
import type { LlmPurpose } from "@/modules/ia/port";
import { centsToMicro, microToCentsCeil } from "@/modules/ia/pricing";

// SDD-021 §4.3: reserva e acerto atômicos. Tudo sob `FOR UPDATE` na linha (família, mês).
// Nenhuma coluna guarda conteúdo (payload, resposta, descrição): só números, enum e modelo.

export const iaDb = (): PrismaClient => getDb();

export type ReserveResult =
  | { ok: true; eventId: string; month: string }
  | { ok: false; reason: "exceeded" | "estimate_exceeds"; resetsOn: string };

async function lockMonth(tx: Tx, familyId: string, month: string, now: Date) {
  await tx.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "updatedAt")
    VALUES (${familyId}::uuid, ${month}, ${now}) ON CONFLICT DO NOTHING`;
  const rows = await tx.$queryRaw<Array<{ spent: bigint; reserved: bigint }>>`
    SELECT "spentMicroBrl" AS spent, "reservedMicroBrl" AS reserved FROM llm_budget_months
    WHERE "familyId" = ${familyId}::uuid AND month = ${month} FOR UPDATE`;
  const row = rows[0] as { spent: bigint; reserved: bigint };
  return { spent: row.spent, reserved: row.reserved };
}

/** Teto efetivo da família: sobrescrita (`families.aiMonthlyCapCents`) ou o padrão do ambiente. */
export async function effectiveCapCents(
  tx: Tx,
  familyId: string,
  envCapCents: number,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ cap: number | null }>>`
    SELECT "aiMonthlyCapCents" AS cap FROM families WHERE id = ${familyId}::uuid`;
  return rows[0]?.cap ?? envCapCents;
}

export async function reserveBudget(
  tx: Tx,
  i: {
    familyId: string;
    memberId: string;
    purpose: LlmPurpose;
    model: string;
    estimateMicro: bigint;
    capCents: number;
    now: Date;
  },
): Promise<ReserveResult> {
  const month = aiMonthKey(i.now);
  let { spent, reserved } = await lockMonth(tx, i.familyId, month, i.now);

  // Limpeza preguiçosa: reservas vencidas viram ABANDONED com custo = reserva (contam como gastas).
  const expired = await tx.$queryRaw<Array<{ reserved: bigint }>>`
    UPDATE llm_usage_events SET status = 'ABANDONED', "costMicroBrl" = "reservedMicroBrl", "settledAt" = ${i.now}
    WHERE "familyId" = ${i.familyId}::uuid AND month = ${month} AND status = 'RESERVED' AND "expiresAt" < ${i.now}
    RETURNING "reservedMicroBrl" AS reserved`;
  const expiredSum = expired.reduce((s, r) => s + r.reserved, 0n);
  spent += expiredSum;
  reserved -= expiredSum;

  const decision = decideBudget({
    spentMicro: spent,
    reservedMicro: reserved,
    estimateMicro: i.estimateMicro,
    capCents: i.capCents,
  });
  if (decision !== "ok") {
    if (expiredSum > 0n) {
      await tx.$executeRaw`UPDATE llm_budget_months SET "spentMicroBrl" = ${spent}, "reservedMicroBrl" = ${reserved}, "updatedAt" = ${i.now}
        WHERE "familyId" = ${i.familyId}::uuid AND month = ${month}`;
    }
    return {
      ok: false,
      reason: decision === "exceeded" ? "exceeded" : "estimate_exceeds",
      resetsOn: resetsOn(month),
    };
  }
  const eventId = newId();
  const expiresAt = new Date(i.now.getTime() + RESERVATION_TTL_MS);
  await tx.$executeRaw`INSERT INTO llm_usage_events
    (id, "familyId", month, purpose, "memberId", model, status, "reservedMicroBrl", "expiresAt", "createdAt")
    VALUES (${eventId}::uuid, ${i.familyId}::uuid, ${month}, ${i.purpose}::"LlmPurpose", ${i.memberId}::uuid,
            ${i.model}, 'RESERVED', ${i.estimateMicro}, ${expiresAt}, ${i.now})`;
  await tx.$executeRaw`UPDATE llm_budget_months SET "spentMicroBrl" = ${spent},
    "reservedMicroBrl" = ${reserved + i.estimateMicro}, "updatedAt" = ${i.now}
    WHERE "familyId" = ${i.familyId}::uuid AND month = ${month}`;
  return { ok: true, eventId, month };
}

export type SettleInput = {
  eventId: string;
  familyId: string;
  month: string;
  status: "SETTLED" | "FAILED";
  outcome: string;
  /** Custo real a contar como gasto (0 se o provedor falhou antes de qualquer token). */
  costMicro: bigint;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  attempts: number | null;
  now: Date;
};

/** Acerto: troca a reserva pelo custo real. Evento já ABANDONED (reserva vencida) só ganha os tokens. */
export async function settleEvent(tx: Tx, s: SettleInput): Promise<void> {
  await lockMonth(tx, s.familyId, s.month, s.now);
  const ev = await tx.$queryRaw<Array<{ status: string; reserved: bigint }>>`
    SELECT status::text AS status, "reservedMicroBrl" AS reserved FROM llm_usage_events
    WHERE id = ${s.eventId}::uuid AND "familyId" = ${s.familyId}::uuid FOR UPDATE`;
  const row = ev[0];
  if (!row) return;
  if (row.status !== "RESERVED") {
    await tx.$executeRaw`UPDATE llm_usage_events SET outcome = ${s.outcome}, "inputTokens" = ${s.inputTokens},
      "outputTokens" = ${s.outputTokens}, "latencyMs" = ${s.latencyMs}, attempts = ${s.attempts}
      WHERE id = ${s.eventId}::uuid`;
    return;
  }
  await tx.$executeRaw`UPDATE llm_usage_events SET status = ${s.status}::"LlmUsageStatus", outcome = ${s.outcome},
    "costMicroBrl" = ${s.costMicro}, "inputTokens" = ${s.inputTokens}, "outputTokens" = ${s.outputTokens},
    "latencyMs" = ${s.latencyMs}, attempts = ${s.attempts}, "settledAt" = ${s.now}
    WHERE id = ${s.eventId}::uuid`;
  await tx.$executeRaw`UPDATE llm_budget_months SET "spentMicroBrl" = "spentMicroBrl" + ${s.costMicro},
    "reservedMicroBrl" = "reservedMicroBrl" - ${row.reserved}, "updatedAt" = ${s.now}
    WHERE "familyId" = ${s.familyId}::uuid AND month = ${s.month}`;
}

export type UsageSnapshot = {
  month: string;
  spentMicro: bigint;
  capCents: number;
  byPurpose: { purpose: LlmPurpose; micro: bigint; calls: number }[];
};

/** Leitura (sem escrita): gasto do mês + reservas vencidas como gastas (conservador). */
export async function readUsage(
  tx: Tx,
  familyId: string,
  envCapCents: number,
  now: Date,
): Promise<UsageSnapshot> {
  const month = aiMonthKey(now);
  const capCents = await effectiveCapCents(tx, familyId, envCapCents);
  const monthRow = await tx.$queryRaw<Array<{ spent: bigint }>>`
    SELECT "spentMicroBrl" AS spent FROM llm_budget_months
    WHERE "familyId" = ${familyId}::uuid AND month = ${month}`;
  const expired = await tx.$queryRaw<Array<{ micro: bigint }>>`
    SELECT COALESCE(SUM("reservedMicroBrl"), 0)::bigint AS micro FROM llm_usage_events
    WHERE "familyId" = ${familyId}::uuid AND month = ${month} AND status = 'RESERVED' AND "expiresAt" < ${now}`;
  const rows = await tx.$queryRaw<Array<{ purpose: LlmPurpose; micro: bigint; calls: bigint }>>`
    SELECT purpose::text AS purpose,
           COALESCE(SUM(CASE
             WHEN status = 'RESERVED' AND "expiresAt" < ${now} THEN "reservedMicroBrl"
             WHEN status = 'RESERVED' THEN 0
             ELSE COALESCE("costMicroBrl", 0) END), 0)::bigint AS micro,
           COUNT(*) FILTER (WHERE status <> 'RESERVED' OR "expiresAt" < ${now})::bigint AS calls
    FROM llm_usage_events
    WHERE "familyId" = ${familyId}::uuid AND month = ${month}
    GROUP BY purpose`;
  const byPurpose = rows.map((r) => ({
    purpose: r.purpose,
    micro: r.micro,
    calls: Number(r.calls),
  }));
  const spentMicro = (monthRow[0]?.spent ?? 0n) + (expired[0]?.micro ?? 0n);
  return { month, spentMicro, capCents, byPurpose };
}

export { centsToMicro, microToCentsCeil };
