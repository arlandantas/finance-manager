import { conflict, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

export const SETTLEMENT_DISABLED_MSG = "O acerto de contas está desligado nesta família";

export async function isSettlementEnabled(tx: Tx, familyId: string): Promise<boolean> {
  const f = await tx.family.findFirst({
    where: { id: familyId },
    select: { settlementEnabled: true },
  });
  return f?.settlementEnabled ?? true;
}

/** Rotas de acerto/regra (SDD-011 §1): `409 SETTLEMENT_DISABLED` com o recurso desligado. */
export async function assertSettlementEnabled(tx: Tx, ctx: Pick<RequestContext, "familyId">) {
  if (!(await isSettlementEnabled(tx, ctx.familyId))) {
    throw conflict("SETTLEMENT_DISABLED", SETTLEMENT_DISABLED_MSG);
  }
}

/** Gravar lançamento "dividido" com o acerto desligado => `422 SETTLEMENT_DISABLED`. */
export async function assertCanShare(tx: Tx, ctx: Pick<RequestContext, "familyId">) {
  if (!(await isSettlementEnabled(tx, ctx.familyId))) {
    throw unprocessable("SETTLEMENT_DISABLED", SETTLEMENT_DISABLED_MSG, [
      { path: "isSharedExpense", message: SETTLEMENT_DISABLED_MSG },
    ]);
  }
}
