import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { formatBRL, toCents } from "@/lib/money";
import { type Period, periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import type { TransferDTO } from "@/modules/contas/schemas";
import { createTransferGroup } from "@/modules/contas/transfers";
import { explainByRules } from "@/modules/split/explain";
import { assertSettlementEnabled } from "@/modules/split/guard";
import { settlementLabel } from "@/modules/split/labels";
import { splitRepo } from "@/modules/split/repo";
import { equalShares, isRuleStale, type RuleInput, ruleAt } from "@/modules/split/rules";
import type {
  CreateSettlementParsed,
  RuleVersionDTO,
  SettlementDTO,
  SettlementEntryDTO,
  SharedExpensesResponse,
  SplitHistoryResponse,
  SplitRuleDTO,
  SplitRuleParsed,
} from "@/modules/split/schemas";
import {
  computeSettlement,
  type ExpenseInput,
  type MemberInput,
  type SettlementResult,
} from "@/modules/split/settlement";
import { memberRefOf } from "@/modules/transacoes/service";

type Repo = ReturnType<typeof splitRepo>;
type MemberRows = Awaited<ReturnType<Repo["listMembers"]>>;
type RuleRows = Awaited<ReturnType<Repo["listRules"]>>;

const memberJoinedOn = (m: { joinedAt: Date }) => todayInFamilyTz({ now: () => m.joinedAt });

function toRuleInputs(rows: RuleRows): RuleInput[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    effectiveFrom: fromDbDate(r.effectiveFrom),
    createdAt: r.createdAt.toISOString(),
    shares: r.shares.map((s) => ({ memberId: s.memberId, bps: s.bps })),
  }));
}

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
    shares: r.kind === "EQUAL" ? equalShares(canonical) : r.shares,
    createdAt: r.createdAt,
    createdBy: createdBy ? (refs.get(createdBy) ?? null) : null,
  };
}

async function loadRuleContext(tx: Tx, ctx: RequestContext) {
  const repo = splitRepo(tx, ctx.familyId);
  // Sequencial: uma transação interativa usa uma única conexão (pg avisa sobre consultas concorrentes).
  const members = await repo.listMembers();
  const ruleRows = await repo.listRules();
  const cutDay = await repo.cutDay();
  const today = todayInFamilyTz(ctx.clock);
  return { repo, members, ruleRows, cutDay, today, rules: toRuleInputs(ruleRows) };
}

function refsOf(members: MemberRows): Map<string, MemberRef> {
  return new Map(members.map((m) => [m.id, memberRefOf(m)] as const));
}

function buildRuleDto(
  c: Awaited<ReturnType<typeof loadRuleContext>>,
  ctx: RequestContext,
): SplitRuleDTO {
  const refs = refsOf(c.members);
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
  const refs = refsOf(c.members);
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

/** PUT /api/v1/split-rule (SDD-002 §5.5): sempre uma nova versão; nunca altera as antigas. */
export async function putSplitRule(
  tx: Tx,
  ctx: RequestContext,
  input: SplitRuleParsed,
): Promise<{ rule: SplitRuleDTO }> {
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

export type LoadedSettlement = {
  period: Period;
  isCurrent: boolean;
  today: string;
  refs: Map<string, MemberRef>;
  members: MemberRows;
  result: SettlementResult;
  stale: boolean;
  ruleKind: "EQUAL" | "PROPORTIONAL";
  groups: Awaited<ReturnType<Repo["activeSettlements"]>>;
  // Entradas do motor, reaproveitadas pela explicação (mesma fonte das cotas, US-022).
  memberInputs: MemberInput[];
  expenseInputs: ExpenseInput[];
  rules: RuleInput[];
  personal: { count: number; totalInCents: number };
};

/** Carrega as entradas e roda o motor puro para o período (SDD-002 §5). */
export async function loadSettlement(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<LoadedSettlement> {
  const c = await loadRuleContext(tx, ctx);
  const currentPeriod = periodOf(c.today, c.cutDay);
  const period = periodKey ? periodFromKey(periodKey, c.cutDay) : currentPeriod;
  const expenses = await c.repo.sharedExpenses(period.start, period.end);
  const groups = await c.repo.activeSettlements(period.key);
  const personal = await c.repo.personalExpenses(period.start, period.end);
  const memberInputs = c.members.map((m, i) => ({
    id: m.id,
    ordinal: i,
    joinedOn: memberJoinedOn(m),
  }));
  const expenseInputs = expenses.map((e) => ({
    id: e.id,
    amountInCents: toCents(e.amountInCents),
    payerMemberId: e.payerMemberId as string,
    occurredOn: fromDbDate(e.occurredOn),
  }));
  const result = computeSettlement({
    period,
    members: memberInputs,
    expenses: expenseInputs,
    rules: c.rules,
    settlements: groups.flatMap((g) => {
      const out = g.legs.find((l) => l.kind === "TRANSFER_OUT");
      if (!out || !g.settlementFromMemberId || !g.settlementToMemberId) return [];
      return [
        {
          fromMemberId: g.settlementFromMemberId,
          toMemberId: g.settlementToMemberId,
          amountInCents: toCents(out.amountInCents),
        },
      ];
    }),
  });
  const current = ruleAt(c.rules, c.today);
  // Períodos encerrados não mudam: o tipo exibido é o da regra vigente no último dia coberto.
  const shown = ruleAt(c.rules, compareDate(period.end, c.today) < 0 ? period.end : c.today);
  return {
    period,
    isCurrent: period.key === currentPeriod.key,
    today: c.today,
    refs: refsOf(c.members),
    members: c.members,
    result,
    stale: isRuleStale(
      current,
      c.members.map((m) => m.id),
    ),
    ruleKind: shown.kind,
    groups,
    memberInputs,
    expenseInputs,
    rules: c.rules,
    personal: { count: personal.count, totalInCents: toCents(personal.total) },
  };
}

export function settlementEntries(l: LoadedSettlement): SettlementEntryDTO[] {
  const year = Number(l.today.slice(0, 4));
  const ref = (id: string): MemberRef => l.refs.get(id) ?? { id, name: "Membro", image: null };
  return l.groups.flatMap((g) => {
    const out = g.legs.find((x) => x.kind === "TRANSFER_OUT");
    const inn = g.legs.find((x) => x.kind === "TRANSFER_IN");
    if (!out?.account || !inn?.account || !g.settlementFromMemberId || !g.settlementToMemberId)
      return [];
    return [
      {
        groupId: g.id,
        from: ref(g.settlementFromMemberId),
        to: ref(g.settlementToMemberId),
        amountInCents: toCents(out.amountInCents),
        occurredOn: fromDbDate(g.occurredOn),
        fromAccount: out.account,
        toAccount: inn.account,
        author: ref(g.authorMemberId),
        createdAt: g.createdAt.toISOString(),
        version: g.version,
        label: settlementLabel(g.settlementPeriod ?? l.period.key, year),
      },
    ];
  });
}

export function toSettlementDto(l: LoadedSettlement, ctx: RequestContext): SettlementDTO {
  const ref = (id: string): MemberRef => l.refs.get(id) ?? { id, name: "Membro", image: null };
  return {
    period: { ...l.period, isCurrent: l.isCurrent },
    status: l.result.status,
    totalSharedInCents: l.result.totalSharedInCents,
    rule: { kind: l.ruleKind, stale: l.stale, canEdit: ctx.role === "ADMIN" },
    members: l.result.members.map((m) => ({
      member: ref(m.memberId),
      paidInCents: m.paidInCents,
      quotaInCents: m.quotaInCents,
      differenceInCents: m.differenceInCents,
      settledAdjustmentInCents: m.settledAdjustmentInCents,
      balanceInCents: m.balanceInCents,
    })),
    personal: l.personal,
    splitExplanation: explainByRules({
      period: l.period,
      today: l.today,
      rules: l.rules,
      members: l.memberInputs,
      expenses: l.expenseInputs,
      result: l.result,
    }),
    suggestions: l.result.suggestions.map((s) => ({
      from: ref(s.fromMemberId),
      to: ref(s.toMemberId),
      amountInCents: s.amountInCents,
    })),
    settlements: settlementEntries(l),
  };
}

/** GET /api/v1/settlement (SDD-002 §3). */
export async function getSettlement(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<SettlementDTO> {
  await assertSettlementEnabled(tx, ctx);
  return toSettlementDto(await loadSettlement(tx, ctx, periodKey), ctx);
}

/** GET /api/v1/settlement/expenses: as despesas comuns que compõem o cálculo (soma = total). */
export async function listSharedExpenses(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<SharedExpensesResponse> {
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const period = periodKey ? periodFromKey(periodKey, c.cutDay) : periodOf(c.today, c.cutDay);
  const rows = await c.repo.sharedExpenses(period.start, period.end);
  const refs = refsOf(c.members);
  const items = rows.map((e) => ({
    id: e.id,
    description: e.description,
    amountInCents: toCents(e.amountInCents),
    occurredOn: fromDbDate(e.occurredOn),
    payer: refs.get(e.payerMemberId as string) ?? {
      id: e.payerMemberId as string,
      name: "Membro",
      image: null,
    },
    category: {
      id: e.category?.id ?? "",
      name: e.category?.name ?? "",
      icon: e.category?.icon ?? "",
    },
  }));
  return { items, totalInCents: items.reduce((s, i) => s + i.amountInCents, 0) };
}

/** POST /api/v1/settlements (SDD-002 §5.4): lock por (família, período), recálculo e transferência. */
export async function registerSettlement(
  tx: Tx,
  ctx: RequestContext,
  input: CreateSettlementParsed,
): Promise<{ transfer: TransferDTO; settlement: SettlementDTO }> {
  await assertSettlementEnabled(tx, ctx);
  const repo = splitRepo(tx, ctx.familyId);
  const members = await repo.listMembers();
  const ids = new Set(members.map((m) => m.id));
  for (const [path, id] of [
    ["fromMemberId", input.fromMemberId],
    ["toMemberId", input.toMemberId],
  ] as const) {
    if (!ids.has(id)) {
      throw unprocessable("INVALID_REFERENCE", "Membro inválido", [
        { path, message: "Membro inválido" },
      ]);
    }
  }
  for (const id of [input.fromAccountId, input.toAccountId]) {
    if (!(await repo.findAccount(id))) throw notFound("Conta não encontrada.");
  }
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  if (compareDate(occurredOn, today) > 0) {
    const message = "A data do acerto não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }
  if (
    ctx.role !== "ADMIN" &&
    ctx.memberId !== input.fromMemberId &&
    ctx.memberId !== input.toMemberId
  ) {
    throw forbidden("Somente os envolvidos ou um Administrador podem registrar o acerto");
  }
  await repo.lockPeriod(input.period);
  const before = await loadSettlement(tx, ctx, input.period);
  const suggestion = before.result.suggestions.find(
    (s) => s.fromMemberId === input.fromMemberId && s.toMemberId === input.toMemberId,
  );
  if (!suggestion) {
    throw unprocessable("SETTLEMENT_NOT_DUE", "Não há valor a acertar entre estes membros");
  }
  if (input.amountInCents > suggestion.amountInCents) {
    const due = suggestion.amountInCents;
    const e = unprocessable(
      "SETTLEMENT_EXCEEDS_DUE",
      `O valor não pode ser maior que o devido (${formatBRL(due)})`,
      { dueInCents: due },
    );
    throw e;
  }
  const transfer = await createTransferGroup(tx, ctx, {
    kind: "SETTLEMENT",
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountInCents: input.amountInCents,
    occurredOn,
    description: settlementLabel(input.period, Number(today.slice(0, 4))),
    settlement: {
      period: input.period,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
    },
  });
  return { transfer, settlement: await getSettlement(tx, ctx, input.period) };
}
