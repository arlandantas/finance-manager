import type { RequestContext, Tx } from "@/lib/api/types";
import { apportion } from "@/lib/apportion";
import { todayInFamilyTz } from "@/lib/dates";
import { periodFromKey, periodOf } from "@/lib/period";
import { buildDrillUrl } from "@/modules/analise/drill";
import { categoryRows } from "@/modules/analise/rows";
import { accountRows, type GroupRow, memberRows, tagRows } from "@/modules/analise/rows-groups";
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
  const side = { ...base, type: q.type };
  const found: GroupRow[] =
    q.groupBy === "member"
      ? await memberRows(tx, side)
      : q.groupBy === "account"
        ? await accountRows(tx, side)
        : q.groupBy === "tag"
          ? await tagRows(tx, side)
          : (await categoryRows(tx, side)).map((r) => ({
              id: r.categoryId,
              kind: "CATEGORY" as const,
              label: r.label,
              archived: r.archived,
              amountInCents: r.amountInCents,
              count: r.count,
            }));
  const sideTotal = q.type === "EXPENSE" ? totals.expenseInCents : totals.incomeInCents;

  const sum = found.reduce((s, r) => s + r.amountInCents, 0);
  const shares =
    sum > 0 && q.groupBy !== "tag"
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
      key: r.id ?? (r.kind === "NO_TAG" ? "no-tag" : "none"),
      kind: r.kind,
      label: r.label,
      archived: r.archived,
      amountInCents: r.amountInCents,
      count: r.count,
      permille: shares ? (shares[String(i)] ?? 0) : null,
      drillUrl: buildDrillUrl(q, range.key, drillRow(r)),
    })),
    rowsTotalInCents: sum,
    tagOverlapNotice: q.groupBy === "tag" && sum > sideTotal,
    isEmpty: totals.incomeInCents === 0 && totals.expenseInCents === 0 && found.length === 0,
  };
}

function drillRow(r: GroupRow) {
  switch (r.kind) {
    case "MEMBER":
      return { payerId: r.id };
    case "ACCOUNT":
    case "CARD":
      return { sourceId: r.id };
    case "TAG":
      return { tagId: r.id };
    case "NO_TAG":
      return { untagged: true };
    default:
      return { categoryId: r.id };
  }
}
