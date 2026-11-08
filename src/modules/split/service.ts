import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { formatBRL, toCents } from "@/lib/money";
import { type Period, periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { INSTALLMENT_SPLIT_RELEASED } from "@/modules/cartoes/installments";
import type { TransferDTO } from "@/modules/contas/schemas";
import { createTransferGroup } from "@/modules/contas/transfers";
import { explainByRules } from "@/modules/split/explain";
import { assertSettlementEnabled } from "@/modules/split/guard";
import { memberInputsOf, ruleInputsOf } from "@/modules/split/inputs";
import { settlementLabel } from "@/modules/split/labels";
import { lockFamilySplit } from "@/modules/split/lock";
import { splitRepo } from "@/modules/split/repo";
import { loadRuleContext, refsOf } from "@/modules/split/rule-context";
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
  computeSettlementFor,
  type ExpenseInput,
  type MemberInput,
  type SettlementResult,
} from "@/modules/split/settlement";
import { memberRefOf } from "@/modules/transacoes/service";

type Repo = ReturnType<typeof splitRepo>;
type MemberRows = Awaited<ReturnType<Repo["listMembers"]>>;
type RuleRows = Awaited<ReturnType<Repo["listRules"]>>;

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
  installmentsOutside: { count: number; totalInCents: number } | null;
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
  const outside = await c.repo.countInstallmentsOutside(period.start, period.end);
  const memberInputs = memberInputsOf(c.allMembers);
  const expenseInputs = expenses.map((e) => ({
    id: e.id,
    amountInCents: toCents(e.amountInCents),
    payerMemberId: e.payerMemberId as string,
    occurredOn: fromDbDate(e.occurredOn),
  }));
  const settlements = groups.flatMap((g) => {
    const out = g.legs.find((l) => l.kind === "TRANSFER_OUT");
    if (!out || !g.settlementFromMemberId || !g.settlementToMemberId) return [];
    return [
      {
        fromMemberId: g.settlementFromMemberId,
        toMemberId: g.settlementToMemberId,
        amountInCents: toCents(out.amountInCents),
      },
    ];
  });
  // EN-002a (ADR-016 §4): STORED soma o rateio gravado; LEGACY aplica a regra vigente na data
  const engine = await c.repo.splitEngine();
  const result =
    engine === "STORED"
      ? computeSettlementFor("STORED", {
          period,
          members: memberInputs,
          settlements,
          expenses: expenseInputs.map((e, idx) => ({
            ...e,
            splits: (expenses[idx]?.splits ?? []).map((s) => ({
              memberId: s.memberId,
              amountInCents: toCents(s.amountInCents),
            })),
          })),
        })
      : computeSettlementFor("LEGACY", {
          period,
          members: memberInputs,
          expenses: expenseInputs,
          rules: c.rules,
          settlements,
        });
  const current = ruleAt(c.rules, c.today);
  // Períodos encerrados não mudam: o tipo exibido é o da regra vigente no último dia coberto.
  const shown = ruleAt(c.rules, compareDate(period.end, c.today) < 0 ? period.end : c.today);
  return {
    period,
    isCurrent: period.key === currentPeriod.key,
    today: c.today,
    refs: refsOf(c.allMembers),
    members: c.allMembers,
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
    installmentsOutside:
      outside.count > 0 && !INSTALLMENT_SPLIT_RELEASED
        ? { count: outside.count, totalInCents: toCents(outside.total) }
        : null,
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
    installmentsOutside: l.installmentsOutside,
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

/** POST /api/v1/settlements (SDD-002 §5.4): lock por (família, período), recálculo e transferência. */
export async function registerSettlement(
  tx: Tx,
  ctx: RequestContext,
  input: CreateSettlementParsed,
): Promise<{ transfer: TransferDTO; settlement: SettlementDTO }> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
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
