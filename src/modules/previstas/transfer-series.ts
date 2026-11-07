import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { shareLockAccounts } from "@/modules/contas/lock";
import {
  addMonths,
  endMonthFromCount,
  HORIZON,
  type MonthISO,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";
import { previstasRepo } from "@/modules/previstas/repo";
import { memberMap } from "@/modules/previstas/service";
import type {
  CreateTransferSeriesParsed,
  TransferSeriesDTO,
  TransferSeriesImpactDTO,
  UpdateTransferSeriesParsed,
} from "@/modules/previstas/transfer-schemas";
import { monthStr, toDTO } from "@/modules/previstas/transfer-series-dto";
import { currentMonthOf, materializeRows } from "@/modules/previstas/transfer-series-generate";
import { transferSeriesRepo } from "@/modules/previstas/transfer-series-repo";

// US-101 (ADR-037 §5, ADR-025): série mensal de transferência prevista. Nunca move dinheiro sozinha.
type Repo = ReturnType<typeof transferSeriesRepo>;

const NOT_FOUND = "Transferência recorrente não encontrada.";
const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);
const seriesEnded = () => conflict("SERIES_ENDED", "Esta recorrência já foi encerrada.");

async function loadDTO(tx: Tx, ctx: RequestContext, id: string): Promise<TransferSeriesDTO> {
  const row = await transferSeriesRepo(tx, ctx.familyId).findById(id);
  if (!row) throw notFound(NOT_FOUND);
  return toDTO(row, await memberMap(previstasRepo(tx, ctx.familyId)));
}

async function checkAccounts(repo: Repo, fields: Array<[string, string]>) {
  const found = new Set((await repo.accountsByIds(fields.map(([, id]) => id))).map((a) => a.id));
  for (const [path, id] of fields) {
    if (!found.has(id)) throw invalidRef(path, "Escolha uma conta ativa");
  }
}

export async function createTransferSeries(
  tx: Tx,
  ctx: RequestContext,
  input: CreateTransferSeriesParsed,
): Promise<{ series: TransferSeriesDTO; generatedCount: number }> {
  const repo = transferSeriesRepo(tx, ctx.familyId);
  const current = currentMonthOf(ctx);
  const startMonth = input.startMonth as MonthISO;
  if (startMonth < current || startMonth > addMonths(current, HORIZON - 1)) {
    const message = "O início deve estar entre o mês atual e os próximos 11 meses";
    throw unprocessable("INVALID_START_MONTH", message, [{ path: "startMonth", message }]);
  }
  await repo.lockFamily();
  await shareLockAccounts(tx, ctx.familyId, [input.fromAccountId, input.toAccountId]);
  await checkAccounts(repo, [
    ["fromAccountId", input.fromAccountId],
    ["toAccountId", input.toAccountId],
  ]);
  const row = await repo.insert({
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountInCents: input.amountInCents,
    description: input.description ?? null,
    dayOfMonth: input.dayOfMonth,
    startMonth,
    endMonth: input.end.kind === "COUNT" ? endMonthFromCount(startMonth, input.end.months) : null,
    authorMemberId: ctx.memberId,
  });
  const generatedCount = await materializeRows(repo, ctx, [row]);
  return { series: await loadDTO(tx, ctx, row.id), generatedCount };
}

export async function listTransferSeries(tx: Tx, ctx: RequestContext) {
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  const rows = await transferSeriesRepo(tx, ctx.familyId).listActive();
  return { items: rows.map((r) => toDTO(r, members)) };
}

function effectiveFromOf(ctx: RequestContext, raw: string | undefined): MonthISO {
  const current = currentMonthOf(ctx);
  const from = (raw ?? current) as MonthISO;
  if (from < current) {
    const message = "A alteração vale a partir do mês atual";
    throw unprocessable("INVALID_EFFECTIVE_FROM", message, [{ path: "effectiveFrom", message }]);
  }
  return from;
}

/** `GET ?impactFrom=`: base da confirmação "N previstas serão alteradas/removidas". */
export async function getTransferSeries(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  impactFrom: string | undefined,
): Promise<{ series: TransferSeriesDTO; impact?: TransferSeriesImpactDTO }> {
  const series = await loadDTO(tx, ctx, id);
  if (impactFrom === undefined) return { series };
  const repo = transferSeriesRepo(tx, ctx.familyId);
  const from = effectiveFromOf(ctx, impactFrom);
  const pending = await repo.lockPendingOccurrences(id, from, todayInFamilyTz(ctx.clock));
  const exceptions = pending.filter((o) => o.isException).length;
  return {
    series,
    impact: {
      affectedCount: pending.length - exceptions,
      keptRealizedCount: await repo.countRealizedFrom(id, from),
      keptExceptionCount: exceptions,
      endCount: pending.length,
    },
  };
}

async function versionConflict(tx: Tx, ctx: RequestContext, id: string) {
  const fresh = await transferSeriesRepo(tx, ctx.familyId).findById(id);
  if (!fresh) return notFound(NOT_FOUND);
  const by = fresh.updatedByMemberId ?? fresh.authorMemberId;
  const name =
    (await memberMap(previstasRepo(tx, ctx.familyId))).get(by)?.name.split(" ")[0] ??
    "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta transferência recorrente foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

/** Ordem de travas: advisory da família → série → ocorrências `FOR UPDATE` → contas (como a efetivação). */
export async function updateTransferSeries(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateTransferSeriesParsed,
): Promise<{ series: TransferSeriesDTO; affectedCount: number }> {
  const repo = transferSeriesRepo(tx, ctx.familyId);
  const from = effectiveFromOf(ctx, input.effectiveFrom);
  await repo.lockFamily();
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.endedAt) throw seriesEnded();
  if (row.version !== input.version) throw await versionConflict(tx, ctx, id);
  const fromAccountId = input.fromAccountId ?? row.fromAccountId;
  const toAccountId = input.toAccountId ?? row.toAccountId;
  if (fromAccountId === toAccountId) throw invalidRef("toAccountId", "Escolha contas diferentes");

  const pending = await repo.lockPendingOccurrences(id, from, todayInFamilyTz(ctx.clock));
  // contas finais sempre ativas (mesmo sem trocar): arquivar é bloqueado com série ativa, então é defesa
  await shareLockAccounts(tx, ctx.familyId, [fromAccountId, toAccountId]);
  await checkAccounts(repo, [
    ["fromAccountId", fromAccountId],
    ["toAccountId", toAccountId],
  ]);

  const startMonth = monthStr(row.startMonth);
  const endMonth: MonthISO | null =
    input.end === undefined
      ? row.endMonth
        ? monthStr(row.endMonth)
        : null
      : input.end.kind === "COUNT"
        ? endMonthFromCount(startMonth, input.end.months)
        : null;
  const next = {
    fromAccountId,
    toAccountId,
    amountInCents: input.amountInCents ?? toCents(row.amountInCents),
    description: input.description !== undefined ? input.description : row.description,
    dayOfMonth: input.dayOfMonth ?? row.dayOfMonth,
    endMonth,
  };
  const res = await repo.updateVersioned(id, input.version, {
    ...next,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(tx, ctx, id);

  const affected = pending.filter((o) => !o.isException);
  const beyondEnd = (o: (typeof affected)[number]) =>
    endMonth !== null && o.occurrenceMonth !== null && monthStr(o.occurrenceMonth) > endMonth;
  const toDelete = affected.filter(beyondEnd);
  for (const o of affected.filter((o) => !beyondEnd(o))) {
    await repo.rewriteOccurrence(o.id, {
      dueOn: occurrenceDueOn(monthStr(o.occurrenceMonth as Date), next.dayOfMonth),
      fromAccountId,
      toAccountId,
      amountInCents: next.amountInCents,
      description: next.description,
      updatedByMemberId: ctx.memberId,
    });
  }
  if (toDelete.length > 0) {
    await repo.softDeleteOccurrences(
      toDelete.map((o) => o.id),
      ctx.memberId,
      ctx.clock.now(),
    );
  }
  const fresh = await repo.findById(id); // fim estendido/removido: completa o horizonte
  if (fresh) await materializeRows(repo, ctx, [fresh]);
  return { series: await loadDTO(tx, ctx, id), affectedCount: affected.length };
}

/** Encerrar: exclui as PREVISTA com vencimento >= hoje (inclui exceções); atrasadas e efetivadas ficam. */
export async function endTransferSeries(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ series: TransferSeriesDTO; removedCount: number }> {
  const repo = transferSeriesRepo(tx, ctx.familyId);
  await repo.lockFamily();
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.endedAt) throw seriesEnded();
  if (row.version !== version) throw await versionConflict(tx, ctx, id);
  const pending = await repo.lockPendingOccurrences(
    id,
    monthStr(row.startMonth),
    todayInFamilyTz(ctx.clock),
  );
  const now = ctx.clock.now();
  const res = await repo.markEnded(id, version, ctx.memberId, now);
  if (res.count === 0) throw await versionConflict(tx, ctx, id);
  if (pending.length > 0) {
    await repo.softDeleteOccurrences(
      pending.map((o) => o.id),
      ctx.memberId,
      now,
    );
  }
  return { series: await loadDTO(tx, ctx, id), removedCount: pending.length };
}
