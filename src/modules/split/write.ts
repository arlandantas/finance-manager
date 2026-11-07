import { unprocessable } from "@/lib/api/errors";
import type { Tx } from "@/lib/api/types";
import { fromCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { memberInputsOf, ruleInputsOf } from "@/modules/split/inputs";
import { ruleAt } from "@/modules/split/rules";
import { resolveRuleShares, splitAmount } from "@/modules/split/split-amount";
import type { SplitInput } from "@/modules/split/split-input";

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

export const SHARES_MEMBER_MISMATCH_MSG =
  "Informe o percentual de todos os membros ativos da família";

/**
 * Vetor "De outro jeito" (US-043): o conjunto de membros precisa ser exatamente o dos ATIVOS. Só entram linhas
 * com `bps > 0` (R5); ordinal = posição por `joinedAt, id`. `ruleVersionId` fica nulo (nada a sugerir).
 */
export async function resolveCustomSplit(
  tx: Tx,
  familyId: string,
  input: { shares: Array<{ memberId: string; bps: number }> },
): Promise<{
  ruleVersionId: null;
  shares: Array<{ memberId: string; bps: number; ordinal: number }>;
}> {
  const members = await tx.member.findMany({
    where: { familyId },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    select: { id: true, removedAt: true },
  });
  const active = new Set(members.filter((m) => m.removedAt === null).map((m) => m.id));
  const given = new Set(input.shares.map((s) => s.memberId));
  if (active.size !== given.size || [...active].some((id) => !given.has(id))) {
    throw unprocessable("SHARES_MEMBER_MISMATCH", SHARES_MEMBER_MISMATCH_MSG, [
      { path: "split.shares", message: SHARES_MEMBER_MISMATCH_MSG },
    ]);
  }
  const ordinal = new Map(members.map((m, i) => [m.id, i] as const));
  return {
    ruleVersionId: null,
    shares: input.shares
      .filter((s) => s.bps > 0)
      .map((s) => ({
        memberId: s.memberId,
        bps: s.bps,
        ordinal: ordinal.get(s.memberId) as number,
      })),
  };
}

type Resolved = {
  ruleVersionId: string | null;
  shares: Array<{ memberId: string; bps: number; ordinal: number; weight?: number }>;
};

/** Vetor do modo pedido para uma despesa em `occurredOn` (`null` em "Só meu"). */
export async function resolveSplit(
  tx: Tx,
  familyId: string,
  split: SplitInput,
  a: { occurredOn: string },
): Promise<Resolved | null> {
  if (split.mode === "NONE") return null;
  if (split.mode === "RULE") return resolveRuleSplit(tx, familyId, a);
  return resolveCustomSplit(tx, familyId, split);
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
