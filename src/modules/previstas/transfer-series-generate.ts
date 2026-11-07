import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import {
  addMonths,
  HORIZON,
  type MonthISO,
  monthOf,
  monthsToGenerate,
  occurrenceDueOn,
} from "@/modules/previstas/recurrence";
import { monthStr, type SeriesRow } from "@/modules/previstas/transfer-series-dto";
import { transferSeriesRepo } from "@/modules/previstas/transfer-series-repo";

type Repo = ReturnType<typeof transferSeriesRepo>;

export const currentMonthOf = (ctx: RequestContext): MonthISO =>
  monthOf(todayInFamilyTz(ctx.clock));

export /** Cria as linhas que faltam das séries dadas (chamador segura a trava da família). */
async function materializeRows(repo: Repo, ctx: RequestContext, series: SeriesRow[]) {
  const current = currentMonthOf(ctx);
  let created = 0;
  for (const s of series) {
    const months = monthsToGenerate(
      {
        startMonth: monthStr(s.startMonth),
        endMonth: s.endMonth ? monthStr(s.endMonth) : null,
        generatedThroughMonth: s.generatedThroughMonth ? monthStr(s.generatedThroughMonth) : null,
        endedAt: s.endedAt,
      },
      current,
      HORIZON,
    );
    const last = months[months.length - 1];
    if (!last) continue;
    const res = await repo.insertOccurrences(
      months.map((m) => ({
        seriesId: s.id,
        occurrenceMonth: m,
        dueOn: occurrenceDueOn(m, s.dayOfMonth),
        fromAccountId: s.fromAccountId,
        toAccountId: s.toAccountId,
        amountInCents: toCents(s.amountInCents),
        description: s.description,
        authorMemberId: s.authorMemberId,
      })),
    );
    created += res.count;
    await repo.setGeneratedThrough(s.id, last);
  }
  return created;
}

const targetOf = (ctx: RequestContext) => addMonths(currentMonthOf(ctx), HORIZON - 1);

/** Atalho (sem trava): há série ativa com horizonte incompleto? */
export async function hasPendingTransferSeries(tx: Tx, ctx: RequestContext): Promise<boolean> {
  const ids = await transferSeriesRepo(tx, ctx.familyId).pendingSeriesIds(targetOf(ctx));
  return ids.length > 0;
}

/**
 * Chamada por `ensureRecurrenceHorizon` JÁ sob `lockFamily`: relê o pendente (outra aba pode ter gerado)
 * e insere com `skipDuplicates`. Série com conta arquivada/excluída não entra (defesa).
 */
export async function materializeTransfers(tx: Tx, ctx: RequestContext): Promise<number> {
  const repo = transferSeriesRepo(tx, ctx.familyId);
  const ids = await repo.pendingSeriesIds(targetOf(ctx));
  if (ids.length === 0) return 0;
  return materializeRows(repo, ctx, await repo.findManyByIds(ids));
}
