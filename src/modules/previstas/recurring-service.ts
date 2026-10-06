import type { PrismaClient } from "@/generated/prisma/client";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import {
  addMonths,
  endMonthFromCount,
  type MonthISO,
  monthOf,
  monthsToGenerate,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";
import { recurringRepo } from "@/modules/previstas/recurring-repo";
import type {
  CreateRecurringExpenseParsed,
  RecurringExpenseDTO,
  SeriesImpactDTO,
  UpdateRecurringExpenseParsed,
} from "@/modules/previstas/recurring-schemas";
import { previstasRepo } from "@/modules/previstas/repo";
import { checkCategory, checkPaymentAccount, memberMap } from "@/modules/previstas/service";
import { assertCanShare } from "@/modules/split/guard";

// ADR-025 / SDD-019 §3.3 e §3.5.
const HORIZON = 12;
const NOT_FOUND = "Despesa recorrente não encontrada.";

type Repo = ReturnType<typeof recurringRepo>;
type SeriesRow = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;

const unknownMember = (id: string): MemberRef => ({ id, name: "Membro", image: null });
const monthStr = (d: Date) => fromDbDate(d).slice(0, 7);
const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

export function toSeriesDTO(row: SeriesRow, members: Map<string, MemberRef>): RecurringExpenseDTO {
  return {
    id: row.id,
    description: row.description,
    amountInCents: toCents(row.amountInCents),
    category: {
      id: row.category.id,
      name: row.category.name,
      icon: row.category.icon,
      archived: row.category.archivedAt !== null,
    },
    responsible: members.get(row.responsibleMemberId) ?? unknownMember(row.responsibleMemberId),
    isSharedExpense: row.isSharedExpense,
    paymentAccount: row.paymentAccount
      ? {
          id: row.paymentAccount.id,
          name: row.paymentAccount.name,
          archived: row.paymentAccount.archivedAt !== null || row.paymentAccount.deletedAt !== null,
        }
      : null,
    dayOfMonth: row.dayOfMonth,
    startMonth: monthStr(row.startMonth),
    endMonth: row.endMonth ? monthStr(row.endMonth) : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const currentMonthOf = (ctx: RequestContext): MonthISO => monthOf(todayInFamilyTz(ctx.clock));

/** Materializa os meses que faltam das séries dadas (sob a trava da família). Devolve quantas linhas criou. */
async function materialize(repo: Repo, ctx: RequestContext, series: SeriesRow[]): Promise<number> {
  const current = currentMonthOf(ctx);
  const accounts = await repo.activeAccountIds(
    series.map((s) => s.paymentAccountId).filter((x): x is string => x !== null),
  );
  let created = 0;
  for (const s of series) {
    const months = monthsToGenerate(
      {
        startMonth: monthStr(s.startMonth) as MonthISO,
        endMonth: s.endMonth ? (monthStr(s.endMonth) as MonthISO) : null,
        generatedThroughMonth: s.generatedThroughMonth
          ? (monthStr(s.generatedThroughMonth) as MonthISO)
          : null,
        endedAt: s.endedAt,
      },
      current,
      HORIZON,
    );
    const last = months[months.length - 1];
    if (!last) continue;
    const paymentAccountId =
      s.paymentAccountId && accounts.has(s.paymentAccountId) ? s.paymentAccountId : null;
    const res = await repo.insertOccurrences(
      months.map((m) => ({
        seriesId: s.id,
        occurrenceMonth: m,
        dueOn: occurrenceDueOn(m, s.dayOfMonth),
        description: s.description,
        amountInCents: toCents(s.amountInCents),
        categoryId: s.categoryId,
        responsibleMemberId: s.responsibleMemberId,
        isSharedExpense: s.isSharedExpense,
        paymentAccountId,
        authorMemberId: s.authorMemberId,
      })),
    );
    created += res.count;
    await repo.setGeneratedThrough(s.id, last);
  }
  return created;
}

/**
 * Geração idempotente e preguiçosa (ADR-025): só age se houver série ativa com horizonte incompleto;
 * depois da trava consultiva da família relê o estado (outra aba pode ter gerado) e insere com
 * `skipDuplicates`. A unicidade (família, série, mês) é a garantia; a trava só evita trabalho repetido.
 */
export async function ensureRecurrenceHorizon(tx: Tx, ctx: RequestContext): Promise<number> {
  const repo = recurringRepo(tx, ctx.familyId);
  const target = addMonths(currentMonthOf(ctx), HORIZON - 1);
  if ((await repo.pendingSeriesIds(target)).length === 0) return 0;
  await repo.lockFamily();
  const ids = await repo.pendingSeriesIds(target);
  if (ids.length === 0) return 0;
  return materialize(repo, ctx, await repo.findManyByIds(ids));
}

/** Transação curta própria, ANTES da leitura (que pode ser REPEATABLE READ) de Início/A pagar/Previstas/Resumo. */
export async function ensureRecurrenceHorizonStandalone(
  ctx: RequestContext,
  db: PrismaClient,
): Promise<void> {
  await db.$transaction((tx) => ensureRecurrenceHorizon(tx, ctx), {
    maxWait: 10_000,
    timeout: 30_000,
  });
}

async function loadSeriesDTO(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<RecurringExpenseDTO> {
  const repo = recurringRepo(tx, ctx.familyId);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  return toSeriesDTO(row, await memberMap(previstasRepo(tx, ctx.familyId)));
}

export async function getSeries(tx: Tx, ctx: RequestContext, id: string) {
  return { series: await loadSeriesDTO(tx, ctx, id) };
}

export async function listSeries(tx: Tx, ctx: RequestContext) {
  const repo = recurringRepo(tx, ctx.familyId);
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  return { items: (await repo.listActive()).map((r) => toSeriesDTO(r, members)) };
}

async function versionConflict(repo: Repo, tx: Tx, ctx: RequestContext, id: string) {
  const fresh = await repo.findById(id);
  if (!fresh) return notFound(NOT_FOUND);
  const by = fresh.updatedByMemberId ?? fresh.authorMemberId;
  const name =
    (await memberMap(previstasRepo(tx, ctx.familyId))).get(by)?.name.split(" ")[0] ??
    "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta despesa recorrente foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

const seriesEnded = () => conflict("SERIES_ENDED", "Esta recorrência já foi encerrada.");

export async function createSeries(
  tx: Tx,
  ctx: RequestContext,
  input: CreateRecurringExpenseParsed,
): Promise<{ series: RecurringExpenseDTO; generatedCount: number }> {
  const repo = recurringRepo(tx, ctx.familyId);
  const prevRepo = previstasRepo(tx, ctx.familyId);
  const current = currentMonthOf(ctx);
  const startMonth = input.startMonth as MonthISO;
  if (startMonth < current || startMonth > addMonths(current, HORIZON - 1)) {
    const message = "O início deve estar entre o mês atual e os próximos 11 meses";
    throw unprocessable("INVALID_START_MONTH", message, [{ path: "startMonth", message }]);
  }
  const responsibleMemberId = input.responsibleMemberId ?? ctx.memberId;
  if (input.isSharedExpense) await assertCanShare(tx, ctx);
  await checkCategory(prevRepo, input.categoryId);
  if (!(await prevRepo.findMember(responsibleMemberId))) {
    throw invalidRef("responsibleMemberId", "Responsável inválido");
  }
  await checkPaymentAccount(prevRepo, input.paymentAccountId);
  await repo.lockFamily();
  const row = await repo.insert({
    description: input.description,
    amountInCents: input.amountInCents,
    categoryId: input.categoryId,
    responsibleMemberId,
    isSharedExpense: input.isSharedExpense,
    paymentAccountId: input.paymentAccountId,
    dayOfMonth: input.dayOfMonth,
    startMonth,
    endMonth: input.end.kind === "COUNT" ? endMonthFromCount(startMonth, input.end.months) : null,
    authorMemberId: ctx.memberId,
  });
  const generatedCount = await materialize(repo, ctx, [row]);
  return { series: await loadSeriesDTO(tx, ctx, row.id), generatedCount };
}

/** Ocorrências "afetadas" pela edição da série (SDD-019 §3.3). */
async function affectedOccurrences(repo: Repo, seriesId: string, from: MonthISO, today: string) {
  const pending = await repo.pendingOccurrences(seriesId, from, today);
  return {
    affected: pending.filter((o) => !o.isException),
    exceptions: pending.filter((o) => o.isException),
  };
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

export async function updateSeries(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateRecurringExpenseParsed,
): Promise<{ series: RecurringExpenseDTO; affectedCount: number }> {
  const repo = recurringRepo(tx, ctx.familyId);
  const prevRepo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const from = effectiveFromOf(ctx, input.effectiveFrom);
  await repo.lockFamily();
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.endedAt) throw seriesEnded();
  if (row.version !== input.version) throw await versionConflict(repo, tx, ctx, id);

  if (input.categoryId !== undefined && input.categoryId !== row.categoryId) {
    await checkCategory(prevRepo, input.categoryId);
  }
  if (
    input.responsibleMemberId !== undefined &&
    input.responsibleMemberId !== row.responsibleMemberId &&
    !(await prevRepo.findMember(input.responsibleMemberId))
  ) {
    throw invalidRef("responsibleMemberId", "Responsável inválido");
  }
  if (input.isSharedExpense === true && !row.isSharedExpense) await assertCanShare(tx, ctx);
  if (input.paymentAccountId !== undefined && input.paymentAccountId !== row.paymentAccountId) {
    await checkPaymentAccount(prevRepo, input.paymentAccountId);
  }

  const startMonth = monthStr(row.startMonth) as MonthISO;
  const endMonth: MonthISO | null =
    input.end === undefined
      ? row.endMonth
        ? (monthStr(row.endMonth) as MonthISO)
        : null
      : input.end.kind === "COUNT"
        ? endMonthFromCount(startMonth, input.end.months)
        : null;
  const next = {
    description: input.description ?? row.description,
    amountInCents: input.amountInCents ?? toCents(row.amountInCents),
    categoryId: input.categoryId ?? row.categoryId,
    responsibleMemberId: input.responsibleMemberId ?? row.responsibleMemberId,
    isSharedExpense: input.isSharedExpense ?? row.isSharedExpense,
    paymentAccountId: input.paymentAccountId ?? row.paymentAccountId,
    dayOfMonth: input.dayOfMonth ?? row.dayOfMonth,
    endMonth,
  };
  const res = await repo.updateVersioned(id, input.version, {
    ...next,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(repo, tx, ctx, id);

  const { affected } = await affectedOccurrences(repo, id, from, today);
  const activeAccounts = await repo.activeAccountIds(
    next.paymentAccountId ? [next.paymentAccountId] : [],
  );
  const paymentAccountId =
    next.paymentAccountId && activeAccounts.has(next.paymentAccountId)
      ? next.paymentAccountId
      : null;
  const beyondEnd = (m: string) => endMonth !== null && m > endMonth;
  const toDelete = affected.filter(
    (o) => o.occurrenceMonth && beyondEnd(monthStr(o.occurrenceMonth)),
  );
  const toRewrite = affected.filter((o) => !toDelete.includes(o));
  for (const o of toRewrite) {
    await repo.rewriteOccurrence(o.id, {
      dueOn: occurrenceDueOn(monthStr(o.occurrenceMonth as Date) as MonthISO, next.dayOfMonth),
      description: next.description,
      amountInCents: next.amountInCents,
      categoryId: next.categoryId,
      responsibleMemberId: next.responsibleMemberId,
      isSharedExpense: next.isSharedExpense,
      paymentAccountId,
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
  // Fim estendido/removido: completa o horizonte.
  const fresh = await repo.findById(id);
  if (fresh) await materialize(repo, ctx, [fresh]);
  return {
    series: await loadSeriesDTO(tx, ctx, id),
    affectedCount: toRewrite.length + toDelete.length,
  };
}

/** `GET /recurring-expenses/:id/impact` — base da confirmação "N previstas serão alteradas/removidas". */
export async function seriesImpact(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  effectiveFrom: string | undefined,
): Promise<SeriesImpactDTO> {
  const repo = recurringRepo(tx, ctx.familyId);
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  const from = effectiveFromOf(ctx, effectiveFrom);
  const { affected, exceptions } = await affectedOccurrences(
    repo,
    id,
    from,
    todayInFamilyTz(ctx.clock),
  );
  return {
    affectedCount: affected.length,
    keptPaidCount: await repo.countPaidFrom(id, from),
    keptExceptionCount: exceptions.length,
    endCount: affected.length + exceptions.length,
  };
}

/** Encerrar: exclusão lógica das pendentes com vencimento >= hoje; baixadas e atrasadas ficam. */
export async function endSeries(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ series: RecurringExpenseDTO; removedCount: number }> {
  const repo = recurringRepo(tx, ctx.familyId);
  await repo.lockFamily();
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.endedAt) throw seriesEnded();
  if (row.version !== version) throw await versionConflict(repo, tx, ctx, id);
  const now = ctx.clock.now();
  const res = await repo.markEnded(id, version, ctx.memberId, now);
  if (res.count === 0) throw await versionConflict(repo, tx, ctx, id);
  const pending = await repo.pendingOccurrences(
    id,
    monthStr(row.startMonth) as MonthISO,
    todayInFamilyTz(ctx.clock),
  );
  if (pending.length > 0) {
    await repo.softDeleteOccurrences(
      pending.map((o) => o.id),
      ctx.memberId,
      now,
    );
  }
  return { series: await loadSeriesDTO(tx, ctx, id), removedCount: pending.length };
}
