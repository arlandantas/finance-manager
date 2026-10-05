import type { Tx } from "@/lib/api/types";
import { fromCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { memberInputsOf, ruleInputsOf } from "@/modules/split/inputs";
import { ruleAt } from "@/modules/split/rules";
import { resolveRuleShares, splitAmount } from "@/modules/split/split-amount";

/**
 * Escrita do rateio por lançamento (EN-002a, SDD-015 §4.3). SÓ para famílias `STORED`; quem chama já
 * tomou `lockFamilySplit`. A criação/edição do lançamento e do rateio ocorrem na MESMA transação
 * (a constraint trigger deferida confere Σ bps e Σ valores no COMMIT).
 */

/** Vetor "Pela regra" para uma despesa em `occurredOn`: regra vigente na data + membros presentes no período. */
export async function resolveRuleSplit(
  tx: Tx,
  familyId: string,
  a: { occurredOn: string },
): Promise<{
  ruleVersionId: string;
  shares: Array<{ memberId: string; bps: number; ordinal: number; weight?: number }>;
}> {
  const family = await tx.family.findFirstOrThrow({
    where: { id: familyId },
    select: { cutDay: true },
  });
  const members = await tx.member.findMany({
    where: { familyId },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  const rules = await tx.splitRuleVersion.findMany({
    where: { familyId },
    include: { shares: true },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const ruleInputs = ruleInputsOf(rules);
  const rule = ruleAt(ruleInputs, a.occurredOn);
  const period = periodOf(a.occurredOn, family.cutDay);
  const shares = resolveRuleShares({ rule, members: memberInputsOf(members), period });
  return { ruleVersionId: rule.id, shares };
}

/** Grava as linhas do rateio de um lançamento já criado (`splitMode = RULE` definido no INSERT/UPDATE). */
export async function insertSplitRows(
  tx: Tx,
  familyId: string,
  a: {
    transactionId: string;
    amountInCents: number;
    payerMemberId: string;
    shares: Array<{ memberId: string; bps: number; ordinal: number; weight?: number }>;
  },
): Promise<void> {
  const amounts = splitAmount({
    amountInCents: a.amountInCents,
    shares: a.shares,
    payerMemberId: a.payerMemberId,
  });
  await tx.transactionSplit.createMany({
    data: a.shares.map((s) => ({
      transactionId: a.transactionId,
      familyId,
      memberId: s.memberId,
      bps: s.bps,
      amountInCents: fromCents(amounts[s.memberId] as number),
    })),
  });
}

/** Recalcula os centavos com os MESMOS `bps` (valor ou pagador mudou; ADR-016 §7): DELETE + INSERT. */
export async function rewriteSplitAmounts(
  tx: Tx,
  familyId: string,
  a: { transactionId: string; amountInCents: number; payerMemberId: string },
): Promise<void> {
  const rows = await tx.transactionSplit.findMany({
    where: { familyId, transactionId: a.transactionId },
  });
  if (rows.length === 0) return;
  // "Pela regra" EQUAL: os centavos saem de pesos iguais (3 membros: 3334/3333/3333 é só a intenção)
  const origin = await tx.transaction.findFirst({
    where: { id: a.transactionId, familyId },
    select: { splitMode: true, splitRule: { select: { kind: true } } },
  });
  const equalWeights = origin?.splitMode === "RULE" && origin.splitRule?.kind === "EQUAL";
  const members = await tx.member.findMany({
    where: { familyId },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const ordinal = new Map(members.map((m, i) => [m.id, i] as const));
  await tx.transactionSplit.deleteMany({ where: { familyId, transactionId: a.transactionId } });
  await insertSplitRows(tx, familyId, {
    transactionId: a.transactionId,
    amountInCents: a.amountInCents,
    payerMemberId: a.payerMemberId,
    shares: rows.map((r) => ({
      memberId: r.memberId,
      bps: r.bps,
      ordinal: ordinal.get(r.memberId) ?? 0,
      ...(equalWeights && r.bps > 0 ? { weight: 1 } : {}),
    })),
  });
}

export async function clearSplitRows(tx: Tx, familyId: string, transactionId: string) {
  await tx.transactionSplit.deleteMany({ where: { familyId, transactionId } });
}
