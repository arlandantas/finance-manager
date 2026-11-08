import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import type { MemberRef } from "@/lib/schemas";
import { ruleInputsOf } from "@/modules/split/inputs";
import { splitRepo } from "@/modules/split/repo";
import type { RuleInput } from "@/modules/split/rules";
import { memberRefOf } from "@/modules/transacoes/service";

type Repo = ReturnType<typeof splitRepo>;
type MemberRows = Awaited<ReturnType<Repo["listMembers"]>>;
type RuleRows = Awaited<ReturnType<Repo["listRules"]>>;

const toRuleInputs = (rows: RuleRows): RuleInput[] => ruleInputsOf(rows);

export async function loadRuleContext(tx: Tx, ctx: RequestContext) {
  const repo = splitRepo(tx, ctx.familyId);
  // Sequencial: uma transação interativa usa uma única conexão (pg avisa sobre consultas concorrentes).
  const allMembers = await repo.listMembers();
  const members = allMembers.filter((m) => !m.removedAt); // ativos: edição de regra, seletores
  const ruleRows = await repo.listRules();
  const cutDay = await repo.cutDay();
  const today = todayInFamilyTz(ctx.clock);
  return { repo, members, allMembers, ruleRows, cutDay, today, rules: toRuleInputs(ruleRows) };
}

export function refsOf(members: MemberRows): Map<string, MemberRef> {
  return new Map(members.map((m) => [m.id, memberRefOf(m)] as const));
}
