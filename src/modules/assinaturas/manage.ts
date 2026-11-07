import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { ensureSubscriptionCharges } from "@/modules/assinaturas/charges";
import { assinaturasRepo } from "@/modules/assinaturas/repo";
import { type AmountRow, amountFor } from "@/modules/assinaturas/schedule";
import type {
  SubscriptionDTO,
  SubscriptionImpact,
  UpdateSubscriptionParsed,
} from "@/modules/assinaturas/schemas";
import { loadOne, NOT_FOUND } from "@/modules/assinaturas/service";
import { addMonths, type MonthISO, monthOf, monthSpan } from "@/modules/previstas/recurrence";
import { previstasRepo } from "@/modules/previstas/repo";
import { memberMap } from "@/modules/previstas/service";
import { lockFamilySplit } from "@/modules/split/lock";
import { assertCanWriteTransaction, assertPersonalForSelf } from "@/modules/transacoes/ownership";
import { transacoesRepo } from "@/modules/transacoes/repo";

// US-097 (ADR-036, spec 12): reajustar/editar e encerrar. Travas: `lockFamilySplit` → advisory → linha `FOR UPDATE`.
type Repo = ReturnType<typeof assinaturasRepo>;
type Row = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;

const monthStr = (d: Date) => fromDbDate(d).slice(0, 7) as MonthISO;
const ended = () => conflict("SUBSCRIPTION_ENDED", "Esta assinatura já foi encerrada.");

async function versionConflict(tx: Tx, ctx: RequestContext, row: Row) {
  const by = row.updatedByMemberId ?? row.endedByMemberId ?? row.authorMemberId;
  const name =
    (await memberMap(previstasRepo(tx, ctx.familyId))).get(by)?.name.split(" ")[0] ??
    "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta assinatura foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: row.version, updatedBy: by },
  );
}

/** Trava, lê e confere: encerrada (409), controle "Só meu" (403, como a compra no cartão) e `version` (409). */
async function loadForWrite(tx: Tx, ctx: RequestContext, id: string, version: number) {
  await lockFamilySplit(tx, ctx.familyId);
  const repo = assinaturasRepo(tx, ctx.familyId);
  await repo.lockSubscriptions();
  if (!(await repo.lockForUpdate(id))) throw notFound(NOT_FOUND);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.endedAt) throw ended();
  await assertCanWriteTransaction(tx, ctx, {
    kind: "EXPENSE",
    isSharedExpense: row.isSharedExpense,
    payerMemberId: row.payerMemberId,
    authorMemberId: row.authorMemberId,
    cardId: row.cardId,
  });
  if (row.version !== version) throw await versionConflict(tx, ctx, row);
  return { repo, row };
}

const amountRows = async (repo: Repo, id: string): Promise<AmountRow[]> =>
  (await repo.amountsOf([id])).map((a) => ({
    fromMonth: monthStr(a.fromMonth),
    amountInCents: toCents(a.amountInCents),
    createdAt: a.createdAt,
  }));

const invalid = (path: string, message: string, code = "INVALID_REFERENCE") =>
  unprocessable(code, message, [{ path, message }]);

/** PATCH /subscriptions/:id. Sem diferença efetiva => 200 sem subir `version`. */
export async function updateSubscription(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateSubscriptionParsed,
): Promise<{ subscription: SubscriptionDTO }> {
  const { repo, row } = await loadForWrite(tx, ctx, id, input.version);
  const tr = transacoesRepo(tx, ctx.familyId);
  const data: { description?: string; categoryId?: string; payerMemberId?: string } = {};
  if (input.description !== undefined && input.description !== row.description) {
    data.description = input.description;
  }
  if (input.categoryId !== undefined && input.categoryId !== row.categoryId) {
    const category = await tr.findCategory(input.categoryId);
    if (!category) throw invalid("categoryId", "Escolha uma categoria");
    if (category.kind !== "EXPENSE") {
      throw invalid(
        "categoryId",
        "A categoria não combina com o tipo do lançamento",
        "CATEGORY_KIND_MISMATCH",
      );
    }
    data.categoryId = input.categoryId;
  }
  if (input.payerMemberId !== undefined && input.payerMemberId !== row.payerMemberId) {
    if (!(await tr.findMember(input.payerMemberId)))
      throw invalid("payerMemberId", "Membro inválido");
    await assertPersonalForSelf(tx, ctx, {
      isSharedExpense: false,
      payerMemberId: input.payerMemberId,
    });
    data.payerMemberId = input.payerMemberId;
  }
  let newAmount: { fromMonth: MonthISO; amountInCents: number } | null = null;
  if (input.amountInCents !== undefined) {
    const next = row.nextChargeOn ? monthOf(fromDbDate(row.nextChargeOn)) : null;
    const fromMonth = (input.effectiveFromMonth ?? next) as MonthISO | null;
    if (!next || !fromMonth || fromMonth < next) {
      throw invalid(
        "effectiveFromMonth",
        "Esse mês já foi cobrado; corrija a cobrança no Extrato",
        "EFFECTIVE_FROM_ALREADY_CHARGED",
      );
    }
    const current = amountFor(fromMonth, await amountRows(repo, id));
    if (current !== input.amountInCents)
      newAmount = { fromMonth, amountInCents: input.amountInCents };
  }
  if (Object.keys(data).length === 0 && !newAmount)
    return { subscription: await loadOne(tx, ctx, id) };

  const res = await repo.updateVersioned(id, input.version, {
    ...data,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(tx, ctx, row);
  if (newAmount)
    await repo.insertAmount({ subscriptionId: id, ...newAmount, authorMemberId: ctx.memberId });
  return { subscription: await loadOne(tx, ctx, id) };
}

/** POST /subscriptions/:id/end: lança antes o que vence até hoje; nada com data > hoje; reativar = cadastrar nova. */
export async function endSubscription(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ subscription: SubscriptionDTO }> {
  const { repo } = await loadForWrite(tx, ctx, id, version);
  const today = todayInFamilyTz(ctx.clock);
  // o teto de 12 por chamada não pode perder cobrança vencida ao zerar `nextChargeOn`
  for (let i = 0; i < 20 && (await repo.dueIds(today, id)).length > 0; i++) {
    await ensureSubscriptionCharges(tx, ctx, { subscriptionId: id });
  }
  const res = await repo.markEnded(id, version, {
    memberId: ctx.memberId,
    on: today,
    at: ctx.clock.now(),
  });
  if (res.count === 0) throw ended();
  return { subscription: await loadOne(tx, ctx, id) };
}

/** `impactFrom`: quantas próximas cobranças um reajuste muda e quantas já lançadas ficam (nunca reescritas). */
export async function getSubscriptionWithImpact(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  impactFrom?: MonthISO,
): Promise<{ subscription: SubscriptionDTO; impact?: SubscriptionImpact }> {
  const subscription = await loadOne(tx, ctx, id);
  if (!impactFrom) return { subscription };
  const repo = assinaturasRepo(tx, ctx.familyId);
  const [row, amounts, counts] = await Promise.all([
    repo.findById(id),
    amountRows(repo, id),
    repo.postedCounts(id),
  ]);
  if (!row) throw notFound(NOT_FOUND);
  const next = row.nextChargeOn ? monthOf(fromDbDate(row.nextChargeOn)) : null;
  const start = next && next > impactFrom ? next : impactFrom;
  // uma vigência posterior já cadastrada prevalece a partir do seu mês
  const later = amounts
    .map((a) => a.fromMonth)
    .filter((m) => m > start)
    .sort()[0];
  const bounds = [row.endMonth ? monthStr(row.endMonth) : null, later ? addMonths(later, -1) : null]
    .filter((m): m is MonthISO => m !== null)
    .sort();
  const last = bounds[0];
  let affectedCount: number | null = null;
  if (!next || row.endedAt) affectedCount = 0;
  else if (last) affectedCount = Math.max(0, last < start ? 0 : monthSpan(start, last));
  return {
    subscription,
    impact: { affectedCount, keptPostedCount: counts.posted, keptAmendedCount: counts.amended },
  };
}
