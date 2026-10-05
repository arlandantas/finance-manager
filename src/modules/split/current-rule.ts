import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { splitRepo } from "@/modules/split/repo";
import { equalShares, type RuleInput, ruleAt } from "@/modules/split/rules";

/** Percentuais da regra vigente hoje (rótulo dinâmico do interruptor "Dividir", US-030). */
export async function currentRuleShares(
  tx: Tx,
  ctx: RequestContext,
): Promise<Array<{ memberId: string; bps: number }>> {
  const repo = splitRepo(tx, ctx.familyId);
  const members = await repo.listMembers();
  const rules: RuleInput[] = (await repo.listRules()).map((r) => ({
    id: r.id,
    kind: r.kind,
    effectiveFrom: fromDbDate(r.effectiveFrom),
    createdAt: r.createdAt.toISOString(),
    shares: r.shares.map((s) => ({ memberId: s.memberId, bps: s.bps })),
  }));
  const rule = ruleAt(rules, todayInFamilyTz(ctx.clock));
  return rule.kind === "EQUAL"
    ? equalShares(members.map((m, i) => ({ id: m.id, ordinal: i })))
    : members.map((m) => ({
        memberId: m.id,
        bps: rule.shares.find((s) => s.memberId === m.id)?.bps ?? 0,
      }));
}
