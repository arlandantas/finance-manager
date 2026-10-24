import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { type Period, periodFromKey, previousPeriod } from "@/lib/period";
import type { SpendingAggregates } from "@/modules/analise-ia/payload";
import {
  type ExpenseRow,
  normalizeDescription,
  type ScheduledSeries,
} from "@/modules/analise-ia/recurring";
import { CATEGORY_ICON_KEYS, type CategoryIconKey } from "@/modules/categorias/schemas";
import { expenseByCategory } from "@/modules/transacoes/category-totals";
import { ledgerTotals } from "@/modules/transacoes/extrato";
import { periodPredicate } from "@/modules/transacoes/ledger-where";

// SDD-023 §4.1: agregados da janela. Mesmo predicado de período do Extrato/Resumo (`periodPredicate`),
// de modo que Σ categorias do mês 0 = `ledgerTotals.expense` = `getMonthSummary.expenseInCents`.

export const MAX_WINDOW = 6;

/** Até 6 períodos terminando em `periodKey`, do mais antigo ao escolhido. */
export function windowPeriods(periodKey: string, cutDay: number): Period[] {
  const last = periodFromKey(periodKey, cutDay);
  const out: Period[] = [last];
  for (let k = 1; k < MAX_WINDOW; k++) {
    out.unshift(previousPeriod(out[0] as Period, cutDay));
  }
  return out;
}

export type WindowData = {
  periods: Period[]; // já sem os períodos iniciais sem despesa; rel = índice - (n - 1)
  aggregates: SpendingAggregates;
  /** Despesas sem parcela agregadas por (descrição, categoria) e período. */
  rows: ExpenseRow[];
  scheduled: ScheduledSeries[];
  eligible: boolean;
};

/** Carrega a janela. Períodos iniciais sem nenhuma despesa são descartados ("últimos N meses"). */
export async function loadWindow(
  tx: Tx,
  familyId: string,
  periodKey: string,
  cutDay: number,
): Promise<WindowData> {
  const all = windowPeriods(periodKey, cutDay);
  const totals = [];
  for (const p of all) {
    totals.push(
      await ledgerTotals(tx, { familyId, start: p.start, end: p.end, includeDeleted: false }),
    );
  }
  const first = totals.findIndex((t) => t.expenseInCents > 0);
  const startIdx = first < 0 ? all.length : first;
  const periods = all.slice(startIdx);
  const kept = totals.slice(startIdx);
  const n = periods.length;
  const relOf = (idx: number) => idx - (n - 1);
  const eligible = kept.filter((t) => t.expenseInCents > 0).length >= 2;

  const perCat = new Map<string, { rel: number; amountInCents: number; count: number }[]>();
  const rows: ExpenseRow[] = [];
  const scheduledMap = new Map<string, ScheduledSeries>();
  for (const [idx, p] of periods.entries()) {
    const rel = relOf(idx);
    const cats = await expenseByCategory(tx, familyId, p);
    for (const c of cats) {
      const list = perCat.get(c.categoryId) ?? [];
      list.push({ rel, amountInCents: c.totalInCents, count: c.count });
      perCat.set(c.categoryId, list);
    }
    const desc = await tx.$queryRaw<
      Array<{ description: string; categoryId: string; total: bigint }>
    >`
      SELECT t.description, t."categoryId"::text AS "categoryId", SUM(t."amountInCents")::bigint AS total
      FROM transactions t
      WHERE t."familyId" = ${familyId}::uuid AND t."deletedAt" IS NULL AND t.kind = 'EXPENSE'
        AND t."installmentPlanId" IS NULL AND ${periodPredicate("t", p.start, p.end)}
      GROUP BY t.description, t."categoryId"`;
    for (const d of desc) {
      if (!normalizeDescription(d.description)) continue;
      rows.push({
        rel,
        categoryId: d.categoryId,
        description: d.description,
        amountInCents: toCents(d.total),
      });
    }
    const sched = await tx.$queryRaw<
      Array<{ id: string; name: string; categoryId: string; total: bigint }>
    >`
      SELECT s.id::text AS id, s.description AS name, s."categoryId"::text AS "categoryId",
             SUM(t."amountInCents")::bigint AS total
      FROM planned_expenses pe
      JOIN transactions t ON t.id = pe."paidTransactionId" AND t."familyId" = pe."familyId"
      JOIN recurring_expenses s ON s.id = pe."seriesId" AND s."familyId" = pe."familyId"
      WHERE pe."familyId" = ${familyId}::uuid AND pe."seriesId" IS NOT NULL AND pe."deletedAt" IS NULL
        AND s."endedAt" IS NULL AND t."deletedAt" IS NULL AND t.kind = 'EXPENSE'
        AND ${periodPredicate("t", p.start, p.end)}
      GROUP BY s.id, s.description, s."categoryId"`;
    for (const s of sched) {
      const cur = scheduledMap.get(s.id) ?? {
        recurringExpenseId: s.id,
        displayName: s.name,
        categoryId: s.categoryId,
        byRel: {},
      };
      cur.byRel[rel] = toCents(s.total);
      scheduledMap.set(s.id, cur);
    }
  }

  const ids = [...perCat.keys()];
  const meta = ids.length
    ? await tx.category.findMany({
        where: { familyId, id: { in: ids } },
        select: { id: true, name: true, icon: true },
      })
    : [];
  const metaById = new Map(meta.map((m) => [m.id, m]));
  const months = kept.map((t, idx) => ({
    rel: relOf(idx),
    expenseInCents: t.expenseInCents,
    incomeInCents: t.incomeInCents,
  }));
  const categories = ids.map((id) => {
    const m = metaById.get(id);
    const byRel = new Map((perCat.get(id) ?? []).map((t) => [t.rel, t]));
    return {
      id,
      name: m?.name ?? "Outra categoria",
      icon: (CATEGORY_ICON_KEYS as readonly string[]).includes(m?.icon ?? "")
        ? (m?.icon as CategoryIconKey)
        : ("package" as CategoryIconKey),
      // um item por mês da janela (zeros incluídos): a IA e a tela veem a série completa
      totals: months.map((mo) => byRel.get(mo.rel) ?? { rel: mo.rel, amountInCents: 0, count: 0 }),
    };
  });
  return {
    periods,
    aggregates: { months, categories },
    rows,
    scheduled: [...scheduledMap.values()],
    eligible,
  };
}
