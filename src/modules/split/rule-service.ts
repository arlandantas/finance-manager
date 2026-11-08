import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { assertSettlementEnabled } from "@/modules/split/guard";
import { lockFamilySplit } from "@/modules/split/lock";
import { computeRulePreview, type RulePreviewDTO } from "@/modules/split/preview";
import { loadRuleContext, refsOf } from "@/modules/split/rule-context";
import { equalShares, isRuleStale, type RuleInput, ruleAt } from "@/modules/split/rules";
import type {
  RuleVersionDTO,
  SplitHistoryResponse,
  SplitRuleDTO,
  SplitRuleParsed,
} from "@/modules/split/schemas";
import { loadSettlement } from "@/modules/split/service";

function ruleDto(
  r: RuleInput,
  canonical: Array<{ id: string; ordinal: number }>,
  refs: Map<string, MemberRef>,
  createdBy: string | null,
): RuleVersionDTO {
  return {
    id: r.id,
    kind: r.kind,
    effectiveFrom: r.effectiveFrom,
    // sempre na ordem canônica dos membros (a ordem das linhas do banco não é estável)
    shares:
      r.kind === "EQUAL"
        ? equalShares(canonical)
        : [...canonical]
            .sort((x, y) => x.ordinal - y.ordinal)
            .flatMap((m) => {
              const s = r.shares.find((x) => x.memberId === m.id);
              return s ? [s] : [];
            }),
    createdAt: r.createdAt,
    createdBy: createdBy ? (refs.get(createdBy) ?? null) : null,
  };
}
function buildRuleDto(
  c: Awaited<ReturnType<typeof loadRuleContext>>,
  ctx: RequestContext,
): SplitRuleDTO {
  const refs = refsOf(c.allMembers);
  const canonical = c.members.map((m, i) => ({ id: m.id, ordinal: i }));
  const createdBy = new Map(c.ruleRows.map((r) => [r.id, r.createdByMemberId] as const));
  const dto = (r: RuleInput) => ruleDto(r, canonical, refs, createdBy.get(r.id) ?? null);
  const current = ruleAt(c.rules, c.today);
  const upcoming = c.rules
    .filter((r) => compareDate(r.effectiveFrom, c.today) > 0)
    .sort(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt),
    );
  return {
    current: dto(current),
    upcoming: upcoming.map(dto),
    members: c.members.map((m) => refs.get(m.id) as MemberRef),
    stale: isRuleStale(
      current,
      c.members.map((m) => m.id),
    ),
    canEdit: ctx.role === "ADMIN",
  };
}

/** GET /api/v1/split-rule (SDD-002 §3). */
export async function getSplitRule(tx: Tx, ctx: RequestContext): Promise<SplitRuleDTO> {
  await assertSettlementEnabled(tx, ctx);
  return buildRuleDto(await loadRuleContext(tx, ctx), ctx);
}

/** GET /api/v1/split-rule/history (SDD-011 §4.1): todas as versões, da mais recente para a mais antiga. */
export async function getSplitHistory(tx: Tx, ctx: RequestContext): Promise<SplitHistoryResponse> {
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const refs = refsOf(c.allMembers);
  const canonical = c.members.map((m, i) => ({ id: m.id, ordinal: i }));
  const createdBy = new Map(c.ruleRows.map((r) => [r.id, r.createdByMemberId] as const));
  const items = [...c.rules]
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt),
    )
    .map((r) => ruleDto(r, canonical, refs, createdBy.get(r.id) ?? null));
  return { items };
}

/** POST /api/v1/split-rule/preview (SDD-011 §4.6): mesmas validações do PUT, sem gravar nada. */
export async function previewRule(
  tx: Tx,
  ctx: RequestContext,
  input: SplitRuleParsed,
): Promise<RulePreviewDTO> {
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const ids = new Set(c.members.map((m) => m.id));
  if (input.kind === "PROPORTIONAL") {
    const given = new Set(input.shares.map((s) => s.memberId));
    const same = given.size === ids.size && [...given].every((id) => ids.has(id));
    if (!same) {
      throw unprocessable("SHARES_MEMBER_MISMATCH", "Informe o percentual de todos os membros", [
        { path: "shares", message: "Informe o percentual de todos os membros" },
      ]);
    }
  }
  const effectiveFrom = input.effectiveFrom ?? c.today;
  const period = periodOf(c.today, c.cutDay);
  if (compareDate(effectiveFrom, period.start) < 0) {
    const message = "A regra só pode valer a partir do período atual";
    throw unprocessable("EFFECTIVE_FROM_IN_PAST", message, [{ path: "effectiveFrom", message }]);
  }
  const l = await loadSettlement(tx, ctx, period.key);
  const canonical = c.members.map((m, i) => ({ id: m.id, ordinal: i }));
  const sharesOf = (r: {
    kind: "EQUAL" | "PROPORTIONAL";
    shares: Array<{ memberId: string; bps: number }>;
  }) => (r.kind === "EQUAL" ? equalShares(canonical) : r.shares);
  const current = ruleAt(c.rules, c.today);
  return computeRulePreview({
    period,
    members: l.memberInputs,
    expenses: l.expenseInputs,
    rules: c.rules,
    settlements: l.groups.flatMap((g) => {
      const out = g.legs.find((x) => x.kind === "TRANSFER_OUT");
      if (!out || !g.settlementFromMemberId || !g.settlementToMemberId) return [];
      return [
        {
          fromMemberId: g.settlementFromMemberId,
          toMemberId: g.settlementToMemberId,
          amountInCents: toCents(out.amountInCents),
        },
      ];
    }),
    candidate:
      input.kind === "PROPORTIONAL"
        ? { kind: "PROPORTIONAL", shares: input.shares }
        : { kind: "EQUAL", shares: [] },
    effectiveFrom,
    nowIso: ctx.clock.now().toISOString(),
    currentShares: sharesOf(current),
    nextShares: sharesOf({
      kind: input.kind,
      shares: input.kind === "PROPORTIONAL" ? input.shares : [],
    }),
  });
}

/** PUT /api/v1/split-rule (SDD-002 §5.5): sempre uma nova versão; nunca altera as antigas. */
export async function putSplitRule(
  tx: Tx,
  ctx: RequestContext,
  input: SplitRuleParsed,
): Promise<{ rule: SplitRuleDTO }> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: a regra nunca muda no meio da migração
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const ids = new Set(c.members.map((m) => m.id));
  if (input.kind === "PROPORTIONAL") {
    const given = new Set(input.shares.map((s) => s.memberId));
    const same = given.size === ids.size && [...given].every((id) => ids.has(id));
    if (!same) {
      throw unprocessable("SHARES_MEMBER_MISMATCH", "Informe o percentual de todos os membros", [
        { path: "shares", message: "Informe o percentual de todos os membros" },
      ]);
    }
  }
  const effectiveFrom = input.effectiveFrom ?? c.today;
  if (compareDate(effectiveFrom, periodOf(c.today, c.cutDay).start) < 0) {
    const message = "A regra só pode valer a partir do período atual";
    throw unprocessable("EFFECTIVE_FROM_IN_PAST", message, [{ path: "effectiveFrom", message }]);
  }
  await c.repo.insertRule({
    kind: input.kind,
    effectiveFrom,
    createdByMemberId: ctx.memberId,
    shares: input.kind === "PROPORTIONAL" ? input.shares : [],
  });
  return { rule: buildRuleDto(await loadRuleContext(tx, ctx), ctx) };
}
