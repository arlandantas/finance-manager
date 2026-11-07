import { badRequest } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { apportion } from "@/lib/apportion";
import { todayInFamilyTz } from "@/lib/dates";
import { periodFromKey, periodOf } from "@/lib/period";
import { buildDrillUrl } from "@/modules/analise/drill";
import { categoryRows } from "@/modules/analise/rows";
import type { AnalysisDTO, AnalysisQuery } from "@/modules/analise/schemas";
import { splitRepo } from "@/modules/split/repo";
import { ledgerTotals } from "@/modules/transacoes/extrato";
import type { LedgerFilters } from "@/modules/transacoes/schemas";

/** Visão sintética (US-048): totais por `ledgerTotals` e linhas pelo mesmo `buildLedgerWhere`. */
export async function getAnalysis(
  tx: Tx,
  ctx: RequestContext,
  q: AnalysisQuery,
): Promise<AnalysisDTO> {
  if (q.groupBy !== "category") {
    throw badRequest("GROUP_BY_UNAVAILABLE", "Esta quebra ainda não está disponível.");
  }
  const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
  const current = periodOf(todayInFamilyTz(ctx.clock), cutDay);
  const range =
    q.from && q.to
      ? { key: `${q.from}..${q.to}`, start: q.from, end: q.to, isCurrent: false }
      : (() => {
          const p = q.period ? periodFromKey(q.period, cutDay) : current;
          return { ...p, isCurrent: p.key === current.key };
        })();

  const base: LedgerFilters = {
    familyId: ctx.familyId,
    start: range.start,
    end: range.end,
    includeDeleted: false,
    ...(q.categoryIds ? { categoryIds: q.categoryIds } : {}),
    ...(q.payerIds ? { payerIds: q.payerIds } : {}),
    ...(q.sourceIds ? { sourceIds: q.sourceIds } : {}),
    ...(q.tagIds ? { tagIds: q.tagIds } : {}),
    ...(q.untagged ? { untagged: true } : {}),
  };
  const totals = await ledgerTotals(tx, base);
  const found = await categoryRows(tx, { ...base, type: q.type });

  const sum = found.reduce((s, r) => s + r.amountInCents, 0);
  const shares =
    sum > 0
      ? apportion(
          1000,
          found.map((r, i) => ({ key: String(i), weight: r.amountInCents, ordinal: i })),
        )
      : null;
  return {
    period: { key: range.key, start: range.start, end: range.end, isCurrent: range.isCurrent },
    totals: {
      incomeInCents: totals.incomeInCents,
      expenseInCents: totals.expenseInCents,
      resultInCents: totals.balanceInCents,
      count: totals.count,
    },
    groupBy: q.groupBy,
    type: q.type,
    rows: found.map((r, i) => ({
      key: r.categoryId ?? "none",
      kind: "category" as const,
      label: r.label,
      archived: r.archived,
      amountInCents: r.amountInCents,
      count: r.count,
      permille: shares ? (shares[String(i)] ?? 0) : null,
      drillUrl: buildDrillUrl(q, range.key, { categoryId: r.categoryId }),
    })),
    rowsTotalInCents: sum,
    tagOverlapNotice: null,
    isEmpty: totals.incomeInCents === 0 && totals.expenseInCents === 0 && found.length === 0,
  };
}
