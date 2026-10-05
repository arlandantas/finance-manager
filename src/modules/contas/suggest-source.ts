/** Sugestão da conta de origem de um pagamento (US-023, SDD-013 §4.1): pura, sem Prisma nem relógio. */
export type SourceCandidate = {
  id: string;
  ownerMemberId: string;
  balanceInCents: number;
  archived: boolean;
  usageCountByMe: number;
};
export type SourceSuggestion = {
  accountId: string | null;
  reason: "OWNER_ENOUGH" | "OTHER_ENOUGH" | "HIGHEST_BALANCE" | "NONE";
  sufficient: boolean; // saldo >= valor
};

/** Marca "saldo insuficiente" no seletor. */
export const insufficient = (a: Pick<SourceCandidate, "balanceInCents">, amountInCents: number) =>
  a.balanceInCents < amountInCents;

const byUsageThenBalance = (a: SourceCandidate, b: SourceCandidate) =>
  b.usageCountByMe - a.usageCountByMe ||
  b.balanceInCents - a.balanceInCents ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byBalanceThenUsage = (a: SourceCandidate, b: SourceCandidate) =>
  b.balanceInCents - a.balanceInCents ||
  b.usageCountByMe - a.usageCountByMe ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 1) conta do titular com saldo suficiente (mais usada; depois maior saldo; depois menor id);
 * 2) outra conta com saldo suficiente (mesmo critério); 3) a de maior saldo (insuficiente);
 * 4) sem contas. Nunca usa "a última conta usada". Contas arquivadas jamais são sugeridas.
 */
export function suggestSourceAccount(i: {
  amountInCents: number;
  ownerMemberId: string;
  accounts: SourceCandidate[];
}): SourceSuggestion {
  const live = i.accounts.filter((a) => !a.archived);
  const enough = live.filter((a) => !insufficient(a, i.amountInCents));
  const ownerEnough = enough
    .filter((a) => a.ownerMemberId === i.ownerMemberId)
    .sort(byUsageThenBalance);
  if (ownerEnough[0])
    return { accountId: ownerEnough[0].id, reason: "OWNER_ENOUGH", sufficient: true };
  const otherEnough = enough.sort(byUsageThenBalance);
  if (otherEnough[0])
    return { accountId: otherEnough[0].id, reason: "OTHER_ENOUGH", sufficient: true };
  const richest = [...live].sort(byBalanceThenUsage)[0];
  if (richest) return { accountId: richest.id, reason: "HIGHEST_BALANCE", sufficient: false };
  return { accountId: null, reason: "NONE", sufficient: false };
}
