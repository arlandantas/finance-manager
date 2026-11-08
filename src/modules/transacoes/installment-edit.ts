import { notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { cardUsage } from "@/modules/cartoes/queries";
import { type Change, recordRevision } from "@/modules/contas/ledger";
import { lockFamilySplit } from "@/modules/split/lock";
import { rewriteSplitAmounts } from "@/modules/split/write";
import { cardOf, type PlanLock, versionConflict } from "@/modules/transacoes/installment-manage";
import {
  bumpPlan,
  LOCKED_MSG,
  loadParcels,
  openPlan,
  type Parcel,
} from "@/modules/transacoes/installment-parcels";
import { loadInstallmentPlanDTO } from "@/modules/transacoes/installment-plan";
import type {
  EditInstallmentParsed,
  EditInstallmentResponse,
} from "@/modules/transacoes/installment-schemas";
import { requireSettledConfirmation } from "@/modules/transacoes/mutations";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";
import { getTransaction } from "@/modules/transacoes/service";

async function respondEdit(
  tx: Tx,
  ctx: RequestContext,
  plan: PlanLock,
  changedIds: string[],
): Promise<EditInstallmentResponse> {
  const transactions: TransactionDetailDTO[] = [];
  for (const id of changedIds) transactions.push((await getTransaction(tx, ctx, id)).transaction);
  const card = await cardOf(tx, ctx, plan.cardId);
  const used = (await cardUsage(tx, ctx.familyId, [plan.cardId])).get(plan.cardId) ?? 0;
  return {
    transactions,
    plan: await loadInstallmentPlanDTO(tx, ctx, plan.id),
    card: {
      id: plan.cardId,
      usedInCents: used,
      availableInCents: toCents(card.limitInCents) - used,
    },
  };
}

/** PATCH /transactions/:id em parcela (US-041): "Somente esta" ou "Esta e as próximas". */
export async function editInstallment(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: EditInstallmentParsed,
): Promise<EditInstallmentResponse> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const plan = await openPlan(tx, ctx, id, { planVersion: input.planVersion });
  if (plan.deletedAt) throw unprocessable("TRANSACTION_DELETED", "Esta compra foi excluída.");
  const parcels = (await loadParcels(tx, ctx, plan)).filter((p) => !p.row.deletedAt);
  const target = parcels.find((p) => p.row.id === id);
  if (!target) {
    throw unprocessable("TRANSACTION_DELETED", "Esta parcela foi excluída. Restaure para editar.");
  }
  if (target.row.version !== input.version) throw await versionConflict(tx, ctx, plan);
  if (target.status !== "OPEN") {
    throw unprocessable("INSTALLMENT_LOCKED", LOCKED_MSG[target.status]);
  }

  const repo = transacoesRepo(tx, ctx.familyId);
  if (input.categoryId !== undefined && input.categoryId !== target.row.categoryId) {
    const category = await repo.findCategory(input.categoryId);
    if (!category) {
      throw unprocessable("INVALID_REFERENCE", "Escolha uma categoria", [
        { path: "categoryId", message: "Escolha uma categoria" },
      ]);
    }
    if (category.kind !== "EXPENSE") {
      throw unprocessable(
        "CATEGORY_KIND_MISMATCH",
        "A categoria não combina com o tipo do lançamento",
        [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
      );
    }
  }

  // `THIS_AND_NEXT`: as seguintes em fatura fechada/paga são puladas (US-041)
  const selected: Parcel[] =
    input.scope === "ONLY_THIS"
      ? [target]
      : parcels.filter((p) => (p.row.installmentNo ?? 0) >= (target.row.installmentNo ?? 0));
  const targets = selected.filter((p) => p.status === "OPEN");

  const diffs = targets.flatMap((p) => {
    const before = {
      amountInCents: toCents(p.row.amountInCents),
      categoryId: p.row.categoryId,
      description: p.row.description,
      note: p.row.note,
    };
    const wanted: Partial<typeof before> = {};
    if (input.amountInCents !== undefined && input.amountInCents !== before.amountInCents) {
      wanted.amountInCents = input.amountInCents;
    }
    if (input.categoryId !== undefined && input.categoryId !== before.categoryId) {
      wanted.categoryId = input.categoryId;
    }
    if (input.description !== undefined && input.description !== before.description) {
      wanted.description = input.description;
    }
    if (input.note !== undefined && input.note !== before.note) wanted.note = input.note;
    const keys = Object.keys(wanted) as Array<keyof typeof before>;
    return keys.length === 0 ? [] : [{ parcel: p, before, wanted, keys }];
  });
  if (diffs.length === 0) return respondEdit(tx, ctx, plan, []);

  // mês acertado: só parcela dividida importa (o período é o da COMPETÊNCIA)
  const sharedMoney = diffs.filter((d) => d.parcel.row.isSharedExpense && d.wanted.amountInCents);
  if (sharedMoney.length > 0) {
    await requireSettledConfirmation(
      tx,
      ctx,
      sharedMoney.map((d) => fromDbDate(d.parcel.row.competenceOn)),
      input.confirmSettledPeriod,
    );
  }

  for (const d of diffs) {
    const { row } = d.parcel;
    const res = await tx.transaction.updateMany({
      where: { id: row.id, familyId: ctx.familyId, version: row.version, deletedAt: null },
      data: { ...d.wanted, updatedByMemberId: ctx.memberId, version: { increment: 1 } },
    });
    if (res.count === 0) throw await versionConflict(tx, ctx, plan);
    if (row.isSharedExpense && row.payerMemberId && d.wanted.amountInCents !== undefined) {
      await rewriteSplitAmounts(tx, ctx.familyId, {
        transactionId: row.id,
        amountInCents: d.wanted.amountInCents,
        payerMemberId: row.payerMemberId,
      }); // mesmos `bps`, novos centavos
    }
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: row.id,
      revision: row.version + 1,
      action: "UPDATE",
      actorMemberId: ctx.memberId,
      changes: d.keys.map((field) => ({
        field,
        from: d.before[field],
        to: d.wanted[field],
      })) satisfies Change[],
    });
  }
  await bumpPlan(tx, ctx, plan.id);
  return respondEdit(
    tx,
    ctx,
    plan,
    diffs.map((d) => d.parcel.row.id),
  );
}
