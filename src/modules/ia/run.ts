import type { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import type { Clock } from "@/lib/clock";
import { logger } from "@/lib/logger";
import { getLlmConfig, type LlmConfig } from "@/modules/ia/config";
import { assertConsentEffective } from "@/modules/ia/consent";
import {
  aiGloballyUnavailable,
  aiUnavailable,
  budgetExceeded,
  estimateExceedsBudget,
  type LlmOutcome,
  outcomeOf,
  purposeNotAvailable,
  toApiError,
} from "@/modules/ia/errors";
import { notifyGlobalBudget } from "@/modules/ia/global-alert";
import { LlmError, type LlmPort, type LlmPurpose, type LlmUsage } from "@/modules/ia/port";
import { costMicroBrl, estimateInputTokens } from "@/modules/ia/pricing";
import { getLlmPort } from "@/modules/ia/provider";
import { effectiveCapCents, iaDb, reserveBudget, settleEvent } from "@/modules/ia/repo";

// SDD-021 §4.4: única orquestração de chamadas ao LLM. Histórias NÃO chamam a porta direto.
// consentimento ➜ reserva (mesma transação curta) ➜ chamada (fora de transação) ➜ validação ➜ acerto.

export type ConsentGuard = (tx: Tx, familyId: string, purpose: LlmPurpose) => Promise<void>;

export type RunLogger = {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
};

export type RunDeps = {
  db?: PrismaClient;
  port?: LlmPort;
  config?: LlmConfig;
  assertConsent?: ConsentGuard;
  log?: RunLogger;
};

export type RunContext = { familyId: string; memberId: string; clock: Clock; requestId: string };

export type RunOptions<P, T> = {
  purpose: LlmPurpose;
  payload: P;
  /** Monta o prompt; `input` deve ser o JSON canônico do payload (o que foi exibido ao usuário). */
  buildPrompt: (payload: P) => { system: string; input: string };
  outputSchema: z.ZodType<T>;
  signal?: AbortSignal;
  /**
   * Regra da história que precisa ser decidida na MESMA transação curta da reserva (ex.: limite de
   * análises por período, US-070). Roda antes do consentimento; se lançar, nada é reservado.
   */
  beforeReserve?: (tx: Tx) => Promise<void>;
};

function purposeSettings(cfg: LlmConfig, purpose: LlmPurpose) {
  if (purpose === "SPENDING_ANALYSIS") {
    return {
      model: cfg.LLM_MODEL_ANALYSIS,
      effort: cfg.LLM_EFFORT_ANALYSIS,
      maxOutputTokens: cfg.LLM_MAX_OUTPUT_TOKENS_ANALYSIS,
    };
  }
  if (purpose === "INVOICE_IMPORT") {
    return {
      model: cfg.LLM_MODEL_IMPORT,
      effort: cfg.LLM_EFFORT_IMPORT,
      maxOutputTokens: cfg.LLM_MAX_OUTPUT_TOKENS_IMPORT,
    };
  }
  throw purposeNotAvailable();
}

export async function runLlm<P, T>(
  ctx: RunContext,
  opts: RunOptions<P, T>,
  deps: RunDeps = {},
): Promise<{ data: T; usageEventId: string; usage: LlmUsage }> {
  const cfg = deps.config ?? getLlmConfig();
  const db = deps.db ?? iaDb();
  const log = deps.log ?? logger;
  const assertConsent = deps.assertConsent ?? assertConsentEffective;

  // 1) disponibilidade (flag) e finalidade
  if (!cfg.featuresEnabled) throw aiUnavailable();
  const { model, effort, maxOutputTokens } = purposeSettings(cfg, opts.purpose);
  const price = cfg.prices[model];
  if (!price) throw aiUnavailable();

  const { system, input } = opts.buildPrompt(opts.payload);
  const estimateMicro = costMicroBrl(
    {
      inputTokens: estimateInputTokens(system.length, Buffer.byteLength(input, "utf8")),
      outputTokens: maxOutputTokens,
    },
    price,
    cfg.LLM_USD_BRL_RATE,
  );

  // 2) consentimento + reserva na MESMA transação curta (separada da chamada ao provedor)
  const startedAt = ctx.clock.now();
  const reservation = await db.$transaction(async (tx) => {
    if (opts.beforeReserve) await opts.beforeReserve(tx);
    await assertConsent(tx, ctx.familyId, opts.purpose);
    const capCents = await effectiveCapCents(tx, ctx.familyId, cfg.LLM_MONTHLY_CAP_CENTS);
    return reserveBudget(tx, {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      purpose: opts.purpose,
      model,
      estimateMicro,
      capCents,
      globalCapCents: cfg.globalCapCents,
      now: startedAt,
    });
  });
  const base = {
    requestId: ctx.requestId,
    familyId: ctx.familyId,
    purpose: opts.purpose,
    model,
  };
  if (!reservation.ok) {
    log.warn({ ...base, outcome: "budget" satisfies LlmOutcome, costMicroBrl: 0 }, "llm_call");
    if (reservation.reason === "global_exceeded") throw aiGloballyUnavailable();
    throw reservation.reason === "exceeded"
      ? budgetExceeded(reservation.resetsOn)
      : estimateExceedsBudget(reservation.resetsOn);
  }

  // 3) chamada, fora de transação, com prazo total combinado ao cancelamento do chamador
  const deadline = AbortSignal.timeout(cfg.LLM_DEADLINE_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  const t0 = performance.now();
  let result: { data: T; usage: LlmUsage; attempts?: number } | undefined;
  let failure: LlmError | undefined;
  try {
    result = await (deps.port ?? getLlmPort()).generate({
      purpose: opts.purpose,
      system,
      input,
      outputSchema: opts.outputSchema,
      maxOutputTokens,
      model,
      effort,
      signal,
    });
  } catch (e) {
    failure = e instanceof LlmError ? e : new LlmError("UNAVAILABLE");
    // prazo estourou (e não foi o usuário que cancelou) ⇒ timeout
    if (failure.code === "CANCELLED" && deadline.aborted && !opts.signal?.aborted) {
      failure = new LlmError("TIMEOUT", failure.usage);
    }
  }
  const latencyMs = Math.round(performance.now() - t0);

  // 4) acerto: custo real (ou 0 se falhou antes de qualquer token; reserva inteira se cancelou sem usage)
  const usage = result?.usage ?? failure?.usage;
  let costMicro = 0n;
  if (usage) {
    costMicro = costMicroBrl(usage, price, cfg.LLM_USD_BRL_RATE);
  } else if (failure?.code === "CANCELLED") {
    costMicro = estimateMicro; // o provedor pode ter cobrado: conservador
  }
  const outcome: LlmOutcome = failure ? outcomeOf(failure.code) : "ok";
  const attempts = result?.attempts ?? null;
  try {
    const settled = await db.$transaction((tx) =>
      settleEvent(tx, {
        eventId: reservation.eventId,
        familyId: ctx.familyId,
        month: reservation.month,
        status: failure ? "FAILED" : "SETTLED",
        outcome,
        costMicro,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        latencyMs,
        attempts,
        now: ctx.clock.now(),
        globalCapCents: cfg.globalCapCents,
      }),
    );
    // SEC-013: alarme depois do commit (log estruturado + e-mail ao dono; melhor esforço)
    if (settled.alert) {
      await notifyGlobalBudget(cfg, reservation.month, settled.alert.pct, log);
    }
  } catch (e) {
    // A reserva expira em 10 min e passa a contar como gasta (conservador).
    log.error(
      { ...base, outcome, err: e instanceof Error ? e.name : "unknown" },
      "llm_settle_failed",
    );
  }

  // 5) log único, sem conteúdo (ADR-028 §6)
  const entry = {
    ...base,
    outcome,
    latencyMs,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    costMicroBrl: Number(costMicro),
    attempts,
  };
  if (failure) {
    (failure.code === "AUTH" ? log.error : log.warn).call(log, entry, "llm_call");
    throw toApiError(failure.code);
  }
  log.info(entry, "llm_call");
  return {
    data: (result as NonNullable<typeof result>).data,
    usageEventId: reservation.eventId,
    usage: (result as NonNullable<typeof result>).usage,
  };
}
