import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import { listPayableInvoices, type PayableInvoice } from "@/modules/cartoes/invoice-service";
import { listAccountBalances } from "@/modules/contas/service";
import { buildByAccount } from "@/modules/previstas/by-account";
import { previstasRepo } from "@/modules/previstas/repo";
import { slicePeriod, sliceReceivables, sliceWindow } from "@/modules/previstas/rules";
import type {
  HomePayablesDTO,
  PayableItemDTO,
  PayablesResponse,
  ReceivableItemDTO,
  ReceivablesResponse,
} from "@/modules/previstas/schemas";
import { memberMap, type PlannedRow } from "@/modules/previstas/service";
import { plannedTransferExtras } from "@/modules/previstas/transfer-extras";

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
    invoiceStatus: null,
    isRecurring: r.seriesId !== null,
    paymentAccountName: r.paymentAccount?.name ?? null,
    paymentAccountId: r.paymentAccountId ?? null,
    authorId: r.authorMemberId,
    paymentAccountOwnerId: r.paymentAccount?.ownerMemberId ?? null,
    href: `/previstas#${r.id}`,
  };
};

const invoiceItem = (i: PayableInvoice, today: string): PayableItemDTO => ({
  type: "INVOICE",
  id: `${i.cardId}:${i.ref}`,
  title: `Fatura ${i.cardName}`,
  dueOn: i.dueDate,
  amountInCents: i.totalInCents,
  isOverdue: i.isOverdue,
  responsible: null,
  isSharedExpense: null,
  invoiceStatus: i.closingDate < today ? "CLOSED" : "OPEN",
  isRecurring: false,
  paymentAccountName: i.paymentAccountName, // US-089: conta pagadora ATIVA do cartão (SDD-030 §3.5)
  paymentAccountId: i.paymentAccountId,
  href: `/cartoes/${i.cardId}?ref=${i.ref}`,
});

/**
 * Única consulta de "A pagar" (SDD-018 §2.2): previstas PREVISTO não excluídas + faturas NÃO pagas
 * (abertas ou fechadas) com total > 0. Todos os recortes (tela, Resumo, Início) partem daqui.
 */
async function collectOpenPayables(tx: Tx, ctx: RequestContext): Promise<PayableItemDTO[]> {
  const repo = previstasRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const members = await memberMap(repo);
  const planned = (await repo.listOpen()).map((r) => plannedItem(r, members, today));
  const invoices = (await listPayableInvoices(tx, ctx, { includeOpen: true })).map((i) =>
    invoiceItem(i, today),
  );
  return [...planned, ...invoices];
}

/** GET /payables (SDD-018 §2.2): mesma definição do "A pagar" do Resumo; separa previstas e faturas. */
export async function listPayables(
  tx: Tx,
  ctx: RequestContext,
  q: { period?: string | undefined },
  opts: { byAccount?: boolean } = {},
): Promise<PayablesResponse> {
  const today = todayInFamilyTz(ctx.clock);
  const cutDay = await previstasRepo(tx, ctx.familyId).cutDay();
  const current = periodOf(today, cutDay);
  const period = q.period ? periodFromKey(q.period, cutDay) : current;
  const isCurrent = period.key === current.key;
  const due = await listDueItems(tx, ctx, { period, isCurrent, today });
  const byAccount =
    opts.byAccount === false
      ? { rows: [], columns: { toReceive: false, plannedTransfers: false } }
      : buildByAccount(
          due.items,
          await listAccountBalances(tx, ctx),
          await plannedTransferExtras(tx, ctx.familyId, { period, isCurrent }),
        );
  return {
    items: due.items,
    groups: {
      planned: due.items.filter((i) => i.type === "PLANNED"),
      invoices: due.items.filter((i) => i.type === "INVOICE"),
    },
    period: { key: period.key, start: period.start, end: period.end },
    totals: {
      dueInCents: due.plannedInCents + due.invoicesInCents,
      overdueInCents: due.overdueInCents,
      overdueCount: due.overdueCount,
    },
    byAccount,
  };
}

/** Janela da Início (US-061): atrasados + vencendo em [hoje, hoje + 7]. */
export async function homePayables(tx: Tx, ctx: RequestContext): Promise<HomePayablesDTO> {
  const today = todayInFamilyTz(ctx.clock);
  const eligible = sliceWindow(await collectOpenPayables(tx, ctx), today, 7);
  const overdue = eligible.filter((i) => i.isOverdue);
  return {
    items: eligible.slice(0, 10),
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

/** Itens "a pagar" de um período (SDD-010 §4.2): recorte por período do coletor único. */
export async function listDueItems(
  tx: Tx,
  ctx: RequestContext,
  q: { period: { key: string; start: string; end: string }; isCurrent: boolean; today: string },
): Promise<DueItems> {
  const items = slicePeriod(await collectOpenPayables(tx, ctx), q);
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

const receivableItem = (
  r: PlannedRow,
  members: Awaited<ReturnType<typeof memberMap>>,
  today: string,
): ReceivableItemDTO => {
  const dueOn = fromDbDate(r.dueOn);
  return {
    id: r.id,
    title: r.description,
    dueOn,
    amountInCents: toCents(r.amountInCents),
    isOverdue: dueOn < today,
    category: { id: r.category.id, name: r.category.name, icon: r.category.icon },
    responsible: members.get(r.responsibleMemberId) ?? {
      id: r.responsibleMemberId,
      name: "Membro",
      image: null,
    },
    destinationAccount: r.paymentAccount
      ? { id: r.paymentAccount.id, name: r.paymentAccount.name }
      : null,
    authorId: r.authorMemberId,
    destinationAccountOwnerId: r.paymentAccount?.ownerMemberId ?? null,
    isSharedExpense: r.isSharedExpense,
    href: `/previstas?tab=receber#${r.id}`,
  };
};

export type ReceivableItems = {
  items: ReceivableItemDTO[]; // atrasadas primeiro, depois dueOn, depois título
  totalInCents: number;
  overdueInCents: number;
  overdueCount: number;
};

/**
 * Itens "a receber" de um período (SDD-017 §4.5): receitas previstas PREVISTO não excluídas, com data esperada
 * no período (+ atrasadas se for o mês corrente). Irmã de `listDueItems`; a receita pendente vive FORA do ledger.
 */
export async function listReceivableItems(
  tx: Tx,
  ctx: RequestContext,
  q: { period: { key: string; start: string; end: string }; isCurrent: boolean; today: string },
): Promise<ReceivableItems> {
  const repo = previstasRepo(tx, ctx.familyId);
  const members = await memberMap(repo);
  const all = (await repo.listOpenReceivable()).map((r) => receivableItem(r, members, q.today));
  const items = sliceReceivables(all, q);
  const overdue = items.filter((i) => i.isOverdue);
  const sum = (xs: ReceivableItemDTO[]) => xs.reduce((s, i) => s + i.amountInCents, 0);
  return {
    items,
    totalInCents: sum(items),
    overdueInCents: sum(overdue),
    overdueCount: overdue.length,
  };
}

/** GET /receivables (SDD-017 §3). */
export async function listReceivables(
  tx: Tx,
  ctx: RequestContext,
  q: { period?: string | undefined },
): Promise<ReceivablesResponse> {
  const today = todayInFamilyTz(ctx.clock);
  const cutDay = await previstasRepo(tx, ctx.familyId).cutDay();
  const current = periodOf(today, cutDay);
  const period = q.period ? periodFromKey(q.period, cutDay) : current;
  const r = await listReceivableItems(tx, ctx, {
    period,
    isCurrent: period.key === current.key,
    today,
  });
  return {
    items: r.items,
    period: { key: period.key, start: period.start, end: period.end },
    totals: {
      dueInCents: r.totalInCents,
      overdueInCents: r.overdueInCents,
      overdueCount: r.overdueCount,
      count: r.items.length,
    },
  };
}
