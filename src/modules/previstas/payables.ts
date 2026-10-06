import type { RequestContext, Tx } from "@/lib/api/types";
import { addDays, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import { listPayableInvoices, type PayableInvoice } from "@/modules/cartoes/invoice-service";
import { previstasRepo } from "@/modules/previstas/repo";
import { comparePayables, isHomeEligible } from "@/modules/previstas/rules";
import type {
  HomePayablesDTO,
  PayableItemDTO,
  PayablesResponse,
} from "@/modules/previstas/schemas";
import { memberMap, type PlannedRow } from "@/modules/previstas/service";

const plannedItem = (
  r: PlannedRow,
  members: Awaited<ReturnType<typeof memberMap>>,
  today: string,
): PayableItemDTO => {
  const dueOn = fromDbDate(r.dueOn);
  return {
    type: "PLANNED",
    id: r.id,
    title: r.description,
    dueOn,
    amountInCents: toCents(r.amountInCents),
    isOverdue: dueOn < today,
    responsible: members.get(r.responsibleMemberId) ?? null,
    isSharedExpense: r.isSharedExpense,
    isRecurring: r.seriesId !== null,
    paymentAccountName: r.paymentAccount?.name ?? null,
    href: `/previstas#${r.id}`,
  };
};

const invoiceItem = (i: PayableInvoice): PayableItemDTO => ({
  type: "INVOICE",
  id: `${i.cardId}:${i.ref}`,
  title: `Fatura ${i.cardName}`,
  dueOn: i.dueDate,
  amountInCents: i.totalInCents,
  isOverdue: i.isOverdue,
  responsible: null,
  isSharedExpense: null,
  isRecurring: false,
  paymentAccountName: null,
  href: `/cartoes/${i.cardId}?ref=${i.ref}`,
});

/** GET /payables (SDD-009 §4.6): previstas PREVISTO + faturas fechadas; no período corrente, também as atrasadas anteriores. */
export async function listPayables(
  tx: Tx,
  ctx: RequestContext,
  q: { period?: string | undefined },
): Promise<PayablesResponse> {
  const repo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const cutDay = await repo.cutDay();
  const current = periodOf(today, cutDay);
  const period = q.period ? periodFromKey(q.period, cutDay) : current;
  const isCurrent = period.key === current.key;
  const members = await memberMap(repo);

  const planned = (await repo.listInRange(period.start, period.end, "PREVISTO")).map((r) =>
    plannedItem(r, members, today),
  );
  const earlierPlanned = isCurrent
    ? (await repo.listOpenBefore(period.start)).map((r) => plannedItem(r, members, today))
    : [];
  const invoices = (await listPayableInvoices(tx, ctx)).filter(
    (i) =>
      (i.dueDate >= period.start && i.dueDate <= period.end) ||
      (isCurrent && i.dueDate < period.start),
  );
  const items = [...planned, ...earlierPlanned, ...invoices.map(invoiceItem)].sort(comparePayables);
  const overdue = items.filter((i) => i.isOverdue);
  return {
    items,
    period: { key: period.key, start: period.start, end: period.end },
    totals: {
      dueInCents: items.reduce((s, i) => s + i.amountInCents, 0),
      overdueInCents: overdue.reduce((s, i) => s + i.amountInCents, 0),
      overdueCount: overdue.length,
    },
  };
}

/** Bloco "A pagar" da Home: atrasados + vencendo em [hoje, hoje + 7], máximo 5 (SDD-009 §4.6). */
export async function homePayables(tx: Tx, ctx: RequestContext): Promise<HomePayablesDTO> {
  const repo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const plus7 = addDays(today, 7);
  const members = await memberMap(repo);
  const planned = (await repo.listOpenUntil(plus7)).map((r) => plannedItem(r, members, today));
  const invoices = (await listPayableInvoices(tx, ctx)).map(invoiceItem);
  const eligible = [...planned, ...invoices]
    .filter((i) => isHomeEligible(i.dueOn, today, plus7))
    .sort(comparePayables);
  const overdue = eligible.filter((i) => i.isOverdue);
  return {
    items: eligible.slice(0, 5),
    overdue: {
      count: overdue.length,
      totalInCents: overdue.reduce((s, i) => s + i.amountInCents, 0),
    },
    totalCount: eligible.length,
  };
}

export type DueItems = {
  items: PayableItemDTO[]; // todos, atrasados primeiro, depois dueOn, depois título
  plannedInCents: number;
  invoicesInCents: number;
  overdueInCents: number;
  overdueCount: number;
};

/**
 * Itens "a pagar" de um período (SDD-010 §4.2): previstas PREVISTO com vencimento no período +
 * faturas NÃO pagas (abertas ou fechadas, total > 0) com vencimento no período; no período corrente
 * entra também todo atrasado de períodos anteriores. Alimenta o Resumo do Mês.
 */
export async function listDueItems(
  tx: Tx,
  ctx: RequestContext,
  q: { period: { key: string; start: string; end: string }; isCurrent: boolean; today: string },
): Promise<DueItems> {
  const repo = previstasRepo(tx, ctx.familyId);
  const members = await memberMap(repo);
  const { period, isCurrent, today } = q;
  const planned = (await repo.listInRange(period.start, period.end, "PREVISTO")).map((r) =>
    plannedItem(r, members, today),
  );
  const earlier = isCurrent
    ? (await repo.listOpenBefore(period.start)).map((r) => plannedItem(r, members, today))
    : [];
  const invoices = (await listPayableInvoices(tx, ctx, { includeOpen: true }))
    .filter(
      (i) =>
        (i.dueDate >= period.start && i.dueDate <= period.end) ||
        (isCurrent && i.dueDate < period.start),
    )
    .map(invoiceItem);
  const items = [...planned, ...earlier, ...invoices].sort(comparePayables);
  const overdue = items.filter((i) => i.isOverdue);
  const sum = (xs: PayableItemDTO[]) => xs.reduce((s, i) => s + i.amountInCents, 0);
  return {
    items,
    plannedInCents: sum(items.filter((i) => i.type === "PLANNED")),
    invoicesInCents: sum(items.filter((i) => i.type === "INVOICE")),
    overdueInCents: sum(overdue),
    overdueCount: overdue.length,
  };
}
