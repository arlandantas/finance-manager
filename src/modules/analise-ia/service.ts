import { ApiError, badRequest, conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { type Period, periodFromKey, periodOf, previousPeriod } from "@/lib/period";
import { loadWindow } from "@/modules/analise-ia/aggregates";
import { type AnalysisRow, toAnalysisDTO } from "@/modules/analise-ia/build-dto";
import { loadDismissedKeys } from "@/modules/analise-ia/dismissals";
import type {
  AnalysisListItemDTO,
  AnalysisPayloadDTO,
  AnalysisPreviewDTO,
  PeriodDTO,
  SentDataDTO,
  SpendingAnalysisDTO,
} from "@/modules/analise-ia/dto";
import { fixturesForFake } from "@/modules/analise-ia/fake-register";
import {
  ANALYSIS_FAILED_MSG,
  ANALYSIS_LIMIT,
  NOT_ENOUGH_MONTHS_MSG,
  shortMonthLabel,
} from "@/modules/analise-ia/labels";
import {
  type AnalysisOutput,
  AnalysisOutputSchema,
  type AnalysisResult,
  InvalidAnalysisOutput,
  reconcileOutput,
} from "@/modules/analise-ia/output";
import {
  type AnalysisPayload,
  buildAnalysisPayload,
  canonicalJson,
  previewHash,
  type RefMap,
} from "@/modules/analise-ia/payload";
import { ANALYSIS_PROMPT, ANALYSIS_PROMPT_VERSION } from "@/modules/analise-ia/prompt";
import { readableOf, sentSummary } from "@/modules/analise-ia/readable";
import { detectRecurring } from "@/modules/analise-ia/recurring";
import type { RequestAnalysisInput } from "@/modules/analise-ia/schemas";
import { getLlmConfig } from "@/modules/ia/config";
import { getFeatureState } from "@/modules/ia/consent";
import { costMicroBrl, estimateInputTokens, microToCentsCeil } from "@/modules/ia/pricing";
import { runLlm } from "@/modules/ia/run";
import { splitRepo } from "@/modules/split/repo";

// SDD-023 §3, §4: pré-visualização ("o que será enviado" = o que é enviado) e pedido da análise.

const PURPOSE = "SPENDING_ANALYSIS" as const;

const limitReached = () =>
  new ApiError(422, "ANALYSIS_LIMIT_REACHED", `Este mês já foi analisado ${ANALYSIS_LIMIT} vezes`);

/** Nomes, sobrenomes e e-mails (e parte local) de TODOS os membros: lista proibida no payload. */
export async function memberIdentifiers(tx: Tx, familyId: string): Promise<string[]> {
  const members = await tx.member.findMany({ where: { familyId }, include: { user: true } });
  const out: string[] = [];
  for (const m of members) {
    if (m.user.name) out.push(m.user.name);
    out.push(m.user.email, m.user.email.split("@")[0] ?? "");
  }
  return out.filter(Boolean);
}

export function periodDto(key: string, partial: boolean): PeriodDTO {
  return { key, label: shortMonthLabel(key), partial };
}

async function resolvePeriod(
  tx: Tx,
  ctx: RequestContext,
  key: string | undefined,
): Promise<{ period: Period; partial: boolean }> {
  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  const current = periodOf(todayInFamilyTz(ctx.clock), cutDay);
  if (key && key > current.key) {
    throw badRequest("PERIOD_OUT_OF_RANGE", "Escolha um mês fechado ou o mês corrente");
  }
  const period = key ? periodFromKey(key, cutDay) : previousPeriod(current, cutDay);
  return { period, partial: period.key === current.key };
}

type PreviewCore = {
  dto: AnalysisPreviewDTO;
  payload: AnalysisPayload | null;
  refMap: RefMap | null;
  memberIds: string[];
  limitCount: number;
};

async function buildPreview(
  tx: Tx,
  ctx: RequestContext,
  key: string | undefined,
): Promise<PreviewCore> {
  const { period, partial } = await resolvePeriod(tx, ctx, key);
  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  const win = await loadWindow(tx, ctx.familyId, period.key, cutDay);
  const feature = await getFeatureState(tx, ctx.familyId, PURPOSE);
  const used = await tx.spendingAnalysis.count({
    where: { familyId: ctx.familyId, periodKey: period.key },
  });
  const memberIds = await memberIdentifiers(tx, ctx.familyId);
  const base = {
    period: periodDto(period.key, partial),
    feature,
    limitReached: used >= ANALYSIS_LIMIT,
    limitMessage: used >= ANALYSIS_LIMIT ? limitReached().message : null,
  };
  if (!win.eligible) {
    return {
      dto: {
        ...base,
        eligible: false,
        ineligibleReason: "NOT_ENOUGH_MONTHS",
        ineligibleMessage: NOT_ENOUGH_MONTHS_MSG,
        sentSummary: sentSummary(win.periods.length),
        payload: null,
        readable: { categories: [], recurring: [] },
        previewHash: "",
        estimateInCents: null,
      },
      payload: null,
      refMap: null,
      memberIds,
      limitCount: used,
    };
  }
  const dismissedKeys = await loadDismissedKeys(tx, ctx.familyId);
  const recurring = detectRecurring({
    rows: win.rows,
    scheduled: win.scheduled,
    windowSize: win.periods.length,
    dismissedKeys,
  });
  const { payload, refMap } = buildAnalysisPayload({
    aggregates: win.aggregates,
    recurring,
    dismissedKeys,
    memberNames: memberIds,
    partial,
    // semente estável por (família, período): o mesmo dado gera o mesmo JSON, e o hash do "preview" vale no envio
    seed: `${ctx.familyId}|${period.key}|v${ANALYSIS_PROMPT_VERSION}`,
  });
  let estimateInCents: number | null = null;
  if (ctx.role === "ADMIN") {
    const cfg = getLlmConfig();
    const price = cfg.prices[cfg.LLM_MODEL_ANALYSIS];
    if (price) {
      estimateInCents = microToCentsCeil(
        costMicroBrl(
          {
            inputTokens: estimateInputTokens(
              ANALYSIS_PROMPT.length,
              Buffer.byteLength(canonicalJson(payload), "utf8"),
            ),
            outputTokens: cfg.LLM_MAX_OUTPUT_TOKENS_ANALYSIS,
          },
          price,
          cfg.LLM_USD_BRL_RATE,
        ),
      );
    }
  }
  return {
    dto: {
      ...base,
      eligible: true,
      ineligibleReason: null,
      ineligibleMessage: null,
      sentSummary: sentSummary(payload.months.length),
      payload: payload as AnalysisPayloadDTO,
      readable: readableOf(payload),
      previewHash: previewHash(payload),
      estimateInCents,
    },
    payload,
    refMap,
    memberIds,
    limitCount: used,
  };
}

/** GET /ai/spending-analysis/preview: NÃO chama o LLM. */
export async function getAnalysisPreview(
  tx: Tx,
  ctx: RequestContext,
  key: string | undefined,
): Promise<AnalysisPreviewDTO> {
  return (await buildPreview(tx, ctx, key)).dto;
}

// ── Persistência e montagem do DTO ──

type DbRow = {
  id: string;
  periodKey: string;
  partial: boolean;
  requestedByMemberId: string;
  model: string;
  payload: unknown;
  result: unknown;
  refMap: unknown;
  createdAt: Date;
};

export async function toDto(tx: Tx, ctx: RequestContext, row: DbRow): Promise<SpendingAnalysisDTO> {
  const refMap = row.refMap as RefMap;
  const ids = Object.values(refMap.categories);
  const cats = ids.length
    ? await tx.category.findMany({
        where: { familyId: ctx.familyId, id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const m = await tx.member.findFirst({
    where: { id: row.requestedByMemberId, familyId: ctx.familyId },
    include: { user: true },
  });
  const analysis: AnalysisRow = {
    id: row.id,
    period: periodDto(row.periodKey, row.partial),
    createdAt: row.createdAt,
    model: row.model,
    payload: row.payload as AnalysisPayloadDTO,
    result: row.result as AnalysisResult,
    refMap,
  };
  return toAnalysisDTO(analysis, {
    requestedBy: {
      id: row.requestedByMemberId,
      name: m ? (m.user.name ?? m.user.email.split("@")[0] ?? "Membro") : "Membro",
      image: m?.user.image ?? null,
      ...(m?.removedAt ? { removed: true as const } : {}),
    },
    categoryNames: new Map(cats.map((c) => [c.id, c.name])),
    dismissedKeys: await loadDismissedKeys(tx, ctx.familyId),
  });
}

async function lockAnalysisCount(tx: Tx, familyId: string, periodKey: string): Promise<number> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`analysis:${familyId}`}, 0))::text`;
  const [r] = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM spending_analyses
    WHERE "familyId" = ${familyId}::uuid AND "periodKey" = ${periodKey}`;
  return r?.n ?? 0;
}

/** POST /ai/spending-analyses (SDD-023 §4.4). Nenhuma escrita em dados de domínio. */
export async function requestAnalysis(
  tx: Tx,
  ctx: RequestContext,
  input: RequestAnalysisInput,
  signal?: AbortSignal,
): Promise<SpendingAnalysisDTO> {
  const pv = await buildPreview(tx, ctx, input.period);
  if (!pv.dto.eligible || !pv.payload || !pv.refMap) {
    throw unprocessable("NOT_ENOUGH_MONTHS", NOT_ENOUGH_MONTHS_MSG);
  }
  if (pv.dto.previewHash !== input.previewHash) {
    throw conflict("PREVIEW_STALE", "Os dados mudaram. Revise o que será enviado");
  }
  const { payload, refMap } = pv;
  const periodKey = pv.dto.period.key;
  fixturesForFake(); // no-op com o provedor real

  let run: Awaited<ReturnType<typeof runLlm<AnalysisPayload, AnalysisOutput>>>;
  try {
    run = await runLlm(
      {
        familyId: ctx.familyId,
        memberId: ctx.memberId,
        clock: ctx.clock,
        requestId: ctx.requestId,
      },
      {
        purpose: PURPOSE,
        payload,
        buildPrompt: (p) => ({ system: ANALYSIS_PROMPT, input: canonicalJson(p) }),
        outputSchema: AnalysisOutputSchema,
        ...(signal ? { signal } : {}),
        beforeReserve: async (rtx) => {
          if ((await lockAnalysisCount(rtx, ctx.familyId, periodKey)) >= ANALYSIS_LIMIT) {
            throw limitReached();
          }
        },
      },
    );
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.code === "LLM_UNAVAILABLE" || e.code === "LLM_INVALID_RESPONSE")
    ) {
      throw new ApiError(e.status, e.code, ANALYSIS_FAILED_MSG);
    }
    throw e;
  }

  let result: AnalysisResult;
  try {
    result = reconcileOutput(run.data, payload, pv.memberIds);
  } catch (e) {
    if (e instanceof InvalidAnalysisOutput) {
      throw new ApiError(502, "LLM_INVALID_RESPONSE", ANALYSIS_FAILED_MSG);
    }
    throw e;
  }

  // Pedidos simultâneos: a reserva acima já barra a maioria; aqui é a última palavra (nada além do limite é salvo).
  if ((await lockAnalysisCount(tx, ctx.familyId, periodKey)) >= ANALYSIS_LIMIT)
    throw limitReached();
  const row = await tx.spendingAnalysis.create({
    data: {
      familyId: ctx.familyId,
      periodKey,
      partial: pv.dto.period.partial,
      requestedByMemberId: ctx.memberId,
      model: run.usage.model,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      payload: payload as object,
      result: result as object,
      refMap: refMap as object,
      usageEventId: run.usageEventId,
      createdAt: ctx.clock.now(),
    },
  });
  await tx.$executeRaw`UPDATE llm_usage_events SET "analysisId" = ${row.id}::uuid
    WHERE id = ${run.usageEventId}::uuid AND "familyId" = ${ctx.familyId}::uuid`;
  return toDto(tx, ctx, row);
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function findRow(tx: Tx, ctx: RequestContext, id: string) {
  if (!isUuid(id)) throw notFound("Análise não encontrada.");
  const row = await tx.spendingAnalysis.findFirst({ where: { id, familyId: ctx.familyId } });
  if (!row) throw notFound("Análise não encontrada.");
  return row;
}

export async function getAnalysis(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<SpendingAnalysisDTO> {
  return toDto(tx, ctx, await findRow(tx, ctx, id));
}

export async function listAnalyses(
  tx: Tx,
  ctx: RequestContext,
): Promise<{ items: AnalysisListItemDTO[] }> {
  const rows = await tx.spendingAnalysis.findMany({
    where: { familyId: ctx.familyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      periodKey: true,
      partial: true,
      createdAt: true,
      requestedByMemberId: true,
    },
  });
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId },
    include: { user: true },
  });
  const byId = new Map(members.map((m) => [m.id, m] as const));
  return {
    items: rows.map((r) => {
      const m = byId.get(r.requestedByMemberId);
      return {
        id: r.id,
        period: periodDto(r.periodKey, r.partial),
        createdAt: r.createdAt.toISOString(),
        requestedBy: {
          id: r.requestedByMemberId,
          name: m ? (m.user.name ?? m.user.email.split("@")[0] ?? "Membro") : "Membro",
          image: m?.user.image ?? null,
          ...(m?.removedAt ? { removed: true as const } : {}),
        },
      };
    }),
  };
}

/** GET /ai/spending-analyses/:id/sent-data: o payload gravado (sem nomes nem contas). */
export async function getSentData(tx: Tx, ctx: RequestContext, id: string): Promise<SentDataDTO> {
  const row = await findRow(tx, ctx, id);
  const payload = row.payload as AnalysisPayload;
  return {
    period: periodDto(row.periodKey, row.partial),
    payload: payload as AnalysisPayloadDTO,
    readable: readableOf(payload),
  };
}

/** POST /ai/spending-analyses/:id/delete (US-073): `DELETE` físico; o consumo fica com `analysisId` nulo. */
export async function deleteAnalysis(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ deleted: number }> {
  if (!isUuid(id)) throw notFound("Análise não encontrada.");
  const r = await tx.spendingAnalysis.deleteMany({ where: { id, familyId: ctx.familyId } });
  if (r.count === 0) throw notFound("Análise não encontrada.");
  return { deleted: r.count };
}

/** POST /ai/spending-analyses/delete-all: apaga todo o histórico; descartes (US-071) permanecem. */
export async function deleteAllAnalyses(tx: Tx, ctx: RequestContext): Promise<{ deleted: number }> {
  const r = await tx.spendingAnalysis.deleteMany({ where: { familyId: ctx.familyId } });
  return { deleted: r.count };
}
