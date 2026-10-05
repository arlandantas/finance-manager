import { apportion } from "@/lib/apportion";
import type { Period } from "@/lib/period";
import { formatSplitLabel, type SplitExplanationDTO } from "@/modules/split/explain";
import { type RuleInput, ruleAt } from "@/modules/split/rules";
import {
  type ExpenseInput,
  isPresent,
  type MemberBalance,
  type MemberInput,
  type SettlementResult,
  type SettlementStatus,
  type Suggestion,
} from "@/modules/split/settlement-common";
import { legacyGroupWeights } from "@/modules/split/settlement-legacy";

/**
 * Alocação do backfill da EN-002b (SDD-015 §4.4, ADR-021 §1): PURA e determinística.
 *
 * Para cada grupo (período, versão da regra) de despesas comuns ativas: `w` = pesos EXATOS do motor
 * LEGACY, `W = Σ w`, `Q = apportion(total_g, w)` (a cota LEGACY). Cada despesa recebe
 * `base_{i,m} = ⌊a_i × w_m ÷ W⌋`; as sobras (`a_i − Σ base`, 0..P−1) são entregues um centavo por vez
 * ao membro de maior `R_m = Q_m − Σ_i base_{i,m}` restante (desempate: menor ordinal; preferindo quem
 * ainda não recebeu centavo naquela despesa).
 *
 * Prova (ADR-021 §1), verificada por propriedade em `tests/unit/split/backfill.test.ts`:
 *  (a) `Σ_i ⌊a_i w_m / W⌋ ≤ ⌊total_g w_m / W⌋ ≤ Q_m`  ⇒  `R_m ≥ 0`;
 *  (b) `Σ_m R_m = total_g − Σ_i Σ_m base = Σ_i sobra_i`;
 *  (c) a cada passo, `Σ R restante = Σ sobra restante`: sempre há destino e o algoritmo termina com todo `R_m = 0`;
 *  (d) logo `Σ_i amount_{i,m} = Q_m` (a cota LEGACY) e `Σ_m amount_{i,m} = a_i`.
 * O `bps` gravado é a intenção (`apportion(10000, w)`) e NÃO entra na alocação (a errata do ADR-016 §5.3).
 */
export type BackfillRow = {
  expenseId: string;
  ruleVersionId: string;
  shares: Array<{ memberId: string; bps: number; amountInCents: number }>;
};

export function allocateBackfill(i: {
  period: Pick<Period, "start" | "end">;
  members: MemberInput[];
  rules: RuleInput[];
  expenses: Array<ExpenseInput & { createdAt: string }>;
}): BackfillRow[] {
  if (i.expenses.length === 0) return [];
  // mesma lista de membros do motor LEGACY: presentes no período ou pagadores de despesa do período
  const payers = new Set(i.expenses.map((e) => e.payerMemberId));
  const members = [...i.members]
    .sort((a, b) => a.ordinal - b.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((m) => isPresent(m, i.period) || payers.has(m.id));

  const ordered = [...i.expenses].sort(
    (a, b) =>
      (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const groups = new Map<string, { rule: RuleInput; expenses: typeof ordered }>();
  for (const e of ordered) {
    const rule = ruleAt(i.rules, e.occurredOn);
    const g = groups.get(rule.id) ?? { rule, expenses: [] };
    g.expenses.push(e);
    groups.set(rule.id, g);
  }

  const out: BackfillRow[] = [];
  for (const { rule, expenses } of groups.values()) {
    const weights = legacyGroupWeights({ rule, members, period: i.period }).filter(
      (w) => w.weight > 0,
    );
    const W = weights.reduce((acc, w) => acc + BigInt(w.weight), 0n);
    const total = expenses.reduce((acc, e) => acc + e.amountInCents, 0);
    const quota = apportion(total, weights); // exatamente a cota que o LEGACY calcula
    const bps = apportion(10000, weights);

    const base = new Map<string, Map<string, bigint>>(); // despesa -> membro -> piso
    const received = new Map<string, bigint>(); // membro -> Σ pisos
    for (const e of expenses) {
      const row = new Map<string, bigint>();
      for (const w of weights) {
        const b = (BigInt(e.amountInCents) * BigInt(w.weight)) / W;
        row.set(w.key, b);
        received.set(w.key, (received.get(w.key) ?? 0n) + b);
      }
      base.set(e.id, row);
    }
    const remaining = new Map<string, number>(
      weights.map((w) => [w.key, (quota[w.key] as number) - Number(received.get(w.key) ?? 0n)]),
    );

    for (const e of expenses) {
      const row = base.get(e.id) as Map<string, bigint>;
      const extra = new Map<string, number>(weights.map((w) => [w.key, 0]));
      let sobra = e.amountInCents - Number([...row.values()].reduce((a, b) => a + b, 0n));
      while (sobra > 0) {
        const eligible = weights.filter((w) => (remaining.get(w.key) as number) > 0);
        const fresh = eligible.filter((w) => (extra.get(w.key) as number) === 0);
        const pool = fresh.length > 0 ? fresh : eligible;
        if (pool.length === 0)
          throw new RangeError("Backfill sem destino para a sobra (invariante)");
        const pick = pool.reduce((best, cur) => {
          const rb = remaining.get(best.key) as number;
          const rc = remaining.get(cur.key) as number;
          return rc > rb || (rc === rb && cur.ordinal < best.ordinal) ? cur : best;
        });
        extra.set(pick.key, (extra.get(pick.key) as number) + 1);
        remaining.set(pick.key, (remaining.get(pick.key) as number) - 1);
        sobra--;
      }
      out.push({
        expenseId: e.id,
        ruleVersionId: rule.id,
        shares: weights.map((w) => ({
          memberId: w.key,
          bps: bps[w.key] as number,
          amountInCents: Number(row.get(w.key)) + (extra.get(w.key) as number),
        })),
      });
    }
  }
  return out;
}

// ── Snapshot e comparação do *gate* (SDD-015 §2, §4.5) ──
export type PeriodSnapshot = {
  periodKey: string;
  status: SettlementStatus;
  totalSharedInCents: number;
  members: MemberBalance[];
  suggestions: Suggestion[];
  weightedPermille: Array<{ memberId: string; permille: number }> | null;
  label: string;
  weightedLine: string | null;
};

export function snapshotOf(
  periodKey: string,
  r: SettlementResult,
  explain: SplitExplanationDTO | null,
  order: string[],
): PeriodSnapshot {
  const text = explain ? formatSplitLabel(explain, order) : null;
  return {
    periodKey,
    status: r.status,
    totalSharedInCents: r.totalSharedInCents,
    members: r.members.map((m) => ({ ...m })),
    suggestions: r.suggestions.map((x) => ({ ...x })),
    weightedPermille: explain?.weighted?.shares.map((x) => ({ ...x })) ?? null,
    label: text?.label ?? "",
    weightedLine: text?.weightedLine ?? null,
  };
}

/** `[]` = idêntico, campo a campo (cota, diferença, saldo, total, sugestões, status, rótulo, linha ponderada). */
export function diffSnapshots(
  a: PeriodSnapshot,
  b: PeriodSnapshot,
): Array<{ field: string; expected: unknown; actual: unknown }> {
  const diffs: Array<{ field: string; expected: unknown; actual: unknown }> = [];
  const check = (field: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push({ field, expected: x, actual: y });
  };
  check("status", a.status, b.status);
  check("totalSharedInCents", a.totalSharedInCents, b.totalSharedInCents);
  const ids = [...new Set([...a.members, ...b.members].map((m) => m.memberId))].sort();
  for (const id of ids) {
    const x = a.members.find((m) => m.memberId === id);
    const y = b.members.find((m) => m.memberId === id);
    for (const k of [
      "paidInCents",
      "quotaInCents",
      "differenceInCents",
      "settledAdjustmentInCents",
      "balanceInCents",
    ] as const) {
      check(`members.${id}.${k}`, x?.[k], y?.[k]);
    }
  }
  check("suggestions", a.suggestions, b.suggestions);
  check("weightedPermille", a.weightedPermille, b.weightedPermille);
  check("label", a.label, b.label);
  check("weightedLine", a.weightedLine, b.weightedLine);
  return diffs;
}
