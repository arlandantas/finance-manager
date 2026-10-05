import { conflict } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { periodOf } from "@/lib/period";
import type { UpdateFamilySettingsInput } from "@/modules/familia/schemas";
import { pendingSettlementMonths } from "@/modules/split/pending";

export type FamilySettingsDTO = {
  id: string;
  name: string;
  settlementEnabled: boolean;
  version: number;
};

/**
 * PATCH /family/settings (SDD-011 §4.4): trava a família (`FOR UPDATE`), confere a versão e, ao desligar
 * com diferença em aberto (qualquer mês, teto 120), exige `confirmPending`. Nada além da chave, da
 * versão e do `FamilyEvent` é escrito: lançamentos, regra e acertos ficam intactos.
 */
export async function updateFamilySettings(
  tx: Tx,
  ctx: RequestContext,
  input: UpdateFamilySettingsInput,
): Promise<{ family: FamilySettingsDTO }> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; name: string; settlementEnabled: boolean; version: number; cutDay: number }>
  >`SELECT id, name, "settlementEnabled", version, "cutDay" FROM families WHERE id = ${ctx.familyId}::uuid FOR UPDATE`;
  const fam = rows[0];
  if (!fam)
    throw conflict("VERSION_CONFLICT", "A família foi alterada. Recarregue para continuar.");
  const dto = (f: {
    settlementEnabled: boolean;
    version: number;
  }): { family: FamilySettingsDTO } => ({
    family: {
      id: fam.id,
      name: fam.name,
      settlementEnabled: f.settlementEnabled,
      version: f.version,
    },
  });
  if (input.version !== fam.version) {
    const by = await tx.family.findFirst({
      where: { id: ctx.familyId },
      select: { updatedByMemberId: true },
    });
    const who = by?.updatedByMemberId
      ? await tx.member.findFirst({
          where: { id: by.updatedByMemberId },
          include: { user: true },
        })
      : null;
    const name = (who?.user.name ?? who?.user.email.split("@")[0] ?? "outra pessoa").split(" ")[0];
    throw conflict(
      "VERSION_CONFLICT",
      `A família foi alterada por ${name}. Recarregue para continuar.`,
    );
  }
  if (input.settlementEnabled === fam.settlementEnabled) return dto(fam);

  if (!input.settlementEnabled && !input.confirmPending) {
    const today = todayInFamilyTz(ctx.clock);
    const months = await pendingSettlementMonths(tx, ctx, {
      toPeriodKey: periodOf(today, fam.cutDay).key,
    });
    const pendingInCents = months.reduce((s, m) => s + m.toSettleInCents, 0);
    if (pendingInCents > 0) {
      throw conflict("SETTLEMENT_PENDING", "Há valor a acertar entre os membros", {
        pendingInCents,
        months: months.map((m) => ({ period: m.periodKey, toSettleInCents: m.toSettleInCents })),
      });
    }
  }
  const updated = await tx.family.update({
    where: { id: ctx.familyId },
    data: {
      settlementEnabled: input.settlementEnabled,
      version: { increment: 1 },
      updatedByMemberId: ctx.memberId,
    },
  });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "SETTLEMENT_TOGGLED",
      actorMemberId: ctx.memberId,
      changes: { settlementEnabled: { from: fam.settlementEnabled, to: input.settlementEnabled } },
    },
  });
  return dto(updated);
}
