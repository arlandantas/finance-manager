import { notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import { canEditSubscription } from "@/modules/assinaturas/access";
import { assinaturasRepo } from "@/modules/assinaturas/repo";
import {
  type AmountRow,
  amountFor,
  endMonthOfSubscription,
  firstChargeOn,
} from "@/modules/assinaturas/schedule";
import type { CreateSubscriptionParsed, SubscriptionDTO } from "@/modules/assinaturas/schemas";
import { addMonths, type MonthISO, monthOf } from "@/modules/previstas/recurrence";
import { previstasRepo } from "@/modules/previstas/repo";
import { memberMap } from "@/modules/previstas/service";
import { assertCanShare } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { assertPersonalForSelf } from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";

export const NOT_FOUND = "Assinatura não encontrada.";
const HORIZON = 12;

type Repo = ReturnType<typeof assinaturasRepo>;
type Row = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;
type Skip = Awaited<ReturnType<Repo["recentSkips"]>>[number];
type AmountDb = Awaited<ReturnType<Repo["amountsOf"]>>[number];

const monthStr = (d: Date) => fromDbDate(d).slice(0, 7) as MonthISO;
const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

const toAmountRow = (a: AmountDb): AmountRow => ({
  fromMonth: monthStr(a.fromMonth),
  amountInCents: toCents(a.amountInCents),
  createdAt: a.createdAt,
});

function toDTO(
  row: Row,
  ctx: {
    members: Map<string, MemberRef>;
    amounts: AmountDb[];
    skips: Skip[];
    month: MonthISO;
    amended: Set<string>;
    editable: Set<string>;
  },
): SubscriptionDTO {
  const mine = (x: { subscriptionId: string }) => x.subscriptionId === row.id;
  const payer = ctx.members.get(row.payerMemberId) ?? {
    id: row.payerMemberId,
    name: "Membro",
    image: null,
  };
  return {
    id: row.id,
    card: {
      id: row.card.id,
      name: row.card.name,
      archived: row.card.archivedAt !== null || row.card.deletedAt !== null,
    },
    description: row.description,
    category: { id: row.category.id, name: row.category.name },
    payer,
    isSharedExpense: row.isSharedExpense,
    dayOfMonth: row.dayOfMonth,
    // antes da 1ª cobrança o "valor atual" é o da 1ª vigência
    currentAmountInCents:
      amountFor(
        ctx.month > monthOf(fromDbDate(row.firstChargeOn))
          ? ctx.month
          : (monthOf(fromDbDate(row.firstChargeOn)) as MonthISO),
        ctx.amounts.filter(mine).map(toAmountRow),
      ) ?? 0,
    firstChargeOn: fromDbDate(row.firstChargeOn),
    nextChargeOn: row.nextChargeOn ? fromDbDate(row.nextChargeOn) : null,
    endMonth: row.endMonth ? monthStr(row.endMonth) : null,
    endedOn: row.endedOn ? fromDbDate(row.endedOn) : null,
    version: row.version,
    amendedThisMonth: ctx.amended.has(row.id),
    canEdit: ctx.editable.has(row.id),
    recentSkips: ctx.skips
      .filter(mine)
      .slice(0, 3)
      .map((s) => ({
        month: monthStr(s.chargeMonth),
        reason: s.status === "SKIPPED_CARD_ARCHIVED" ? "CARD_ARCHIVED" : "INVOICE_PAID",
      })),
  };
}

export async function toDTOs(tx: Tx, ctx: RequestContext, rows: Row[]): Promise<SubscriptionDTO[]> {
  if (rows.length === 0) return [];
  const repo = assinaturasRepo(tx, ctx.familyId);
  const ids = rows.map((r) => r.id);
  const month = monthOf(todayInFamilyTz(ctx.clock)) as MonthISO;
  const [members, amounts, skips, amended] = await Promise.all([
    memberMap(previstasRepo(tx, ctx.familyId)),
    repo.amountsOf(ids),
    repo.recentSkips(ids),
    repo.amendedIn(ids, month),
  ]);
  const editable = new Set<string>();
  for (const r of rows) if (await canEditSubscription(tx, ctx, r)) editable.add(r.id);
  return rows.map((r) => toDTO(r, { members, amounts, skips, month, amended, editable }));
}

/**
 * Cadastro (US-096, ADR-036). Ordem de travas: `lockFamilySplit` → advisory `subscriptions:{familyId}` →
 * cartão `FOR SHARE`. As travas de propriedade são as da compra no cartão (`assertPersonalForSelf`, spec 01).
 */
export async function createSubscription(
  tx: Tx,
  ctx: RequestContext,
  input: CreateSubscriptionParsed,
): Promise<{ subscription: SubscriptionDTO }> {
  await lockFamilySplit(tx, ctx.familyId);
  const repo = assinaturasRepo(tx, ctx.familyId);
  await repo.lockSubscriptions();
  if (!(await repo.lockActiveCard(input.cardId))) throw invalidRef("cardId", "Escolha um cartão");
  const category = await transacoesRepo(tx, ctx.familyId).findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  if (category.kind !== "EXPENSE") {
    const message = "A categoria não combina com o tipo do lançamento";
    throw unprocessable("CATEGORY_KIND_MISMATCH", message, [{ path: "categoryId", message }]);
  }
  const today = todayInFamilyTz(ctx.clock);
  const current = monthOf(today) as MonthISO;
  const startMonth = (input.startMonth ?? current) as MonthISO;
  if (startMonth < current || startMonth > addMonths(current, HORIZON - 1)) {
    const message = "O início deve estar entre o mês atual e os próximos 11 meses";
    throw unprocessable("INVALID_START_MONTH", message, [{ path: "startMonth", message }]);
  }
  const payerMemberId = input.payerMemberId ?? ctx.memberId;
  if (!(await transacoesRepo(tx, ctx.familyId).findMember(payerMemberId))) {
    throw invalidRef("payerMemberId", "Membro inválido");
  }
  const isSharedExpense = input.isSharedExpense === true;
  if (isSharedExpense) await assertCanShare(tx, ctx); // O2: acerto desligado => 422
  await assertPersonalForSelf(tx, ctx, { isSharedExpense, payerMemberId });

  const first = firstChargeOn(startMonth, input.dayOfMonth, today);
  const created = await repo.insert({
    cardId: input.cardId,
    description: input.description,
    categoryId: input.categoryId,
    payerMemberId,
    isSharedExpense,
    dayOfMonth: input.dayOfMonth,
    firstChargeOn: first,
    endMonth: endMonthOfSubscription(first, input.end),
    authorMemberId: ctx.memberId,
    amountInCents: input.amountInCents,
    fromMonth: monthOf(first) as MonthISO,
  });
  return { subscription: await loadOne(tx, ctx, created.id) };
}

export async function loadOne(tx: Tx, ctx: RequestContext, id: string): Promise<SubscriptionDTO> {
  const row = await assinaturasRepo(tx, ctx.familyId).findById(id);
  if (!row) throw notFound(NOT_FOUND);
  const [dto] = await toDTOs(tx, ctx, [row]);
  return dto as SubscriptionDTO;
}

export async function getSubscription(tx: Tx, ctx: RequestContext, id: string) {
  return { subscription: await loadOne(tx, ctx, id) };
}
