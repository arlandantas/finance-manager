import { describe, expect, it } from "vitest";
import { type Period, periodFromKey } from "@/lib/period";
import {
  allocateBackfill,
  diffSnapshots,
  type PeriodSnapshot,
  snapshotOf,
} from "@/modules/split/backfill";
import type { RuleInput } from "@/modules/split/rules";
import type { ExpenseInput, MemberInput } from "@/modules/split/settlement-common";
import { computeSettlementLegacy } from "@/modules/split/settlement-legacy";
import { mulberry32 } from "../../support/prng";

const period = periodFromKey("2026-10");
const M: MemberInput = { id: "m", ordinal: 0, joinedOn: "2026-01-01" };
const L: MemberInput = { id: "l", ordinal: 1, joinedOn: "2026-01-01" };
const EQUAL: RuleInput = {
  id: "r0",
  kind: "EQUAL",
  effectiveFrom: "1970-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  shares: [],
};
const e = (
  id: string,
  amount: number,
  payer: string,
  on = "2026-10-10",
): ExpenseInput & { createdAt: string } => ({
  id,
  amountInCents: amount,
  payerMemberId: payer,
  occurredOn: on,
  createdAt: `${on}T12:00:00.${id.padStart(3, "0").slice(-3)}Z`,
});

describe("allocateBackfill: casos nomeados (SDD-015 §8.1)", () => {
  it("N6 (ímpares): três despesas de 10001 a 50/50 pagas por Mariana => cotas 15002/15001; Σ por despesa = valor", () => {
    const expenses = [e("1", 10001, "m"), e("2", 10001, "m"), e("3", 10001, "m")];
    const rows = allocateBackfill({ period, members: [M, L], rules: [EQUAL], expenses });
    const sum = (id: string) =>
      rows.reduce((a, r) => a + (r.shares.find((s) => s.memberId === id)?.amountInCents ?? 0), 0);
    expect(sum("m")).toBe(15002);
    expect(sum("l")).toBe(15001);
    for (const r of rows) {
      expect(r.shares.reduce((a, s) => a + s.amountInCents, 0)).toBe(10001);
      expect(r.shares.map((s) => s.bps)).toEqual([5000, 5000]);
      expect(r.ruleVersionId).toBe("r0");
    }
  });
  it("N3: troca 50/50 => 58/42 (40000 em 02/10, 100000 em 10/10) => 78000/62000, bps por regra", () => {
    const R2: RuleInput = {
      id: "r1",
      kind: "PROPORTIONAL",
      effectiveFrom: "2026-10-05",
      createdAt: "2026-10-05T00:00:00Z",
      shares: [
        { memberId: "m", bps: 5800 },
        { memberId: "l", bps: 4200 },
      ],
    };
    const rows = allocateBackfill({
      period,
      members: [M, L],
      rules: [EQUAL, R2],
      expenses: [e("1", 40000, "m", "2026-10-02"), e("2", 100000, "l", "2026-10-10")],
    });
    expect(rows[0]).toMatchObject({
      expenseId: "1",
      ruleVersionId: "r0",
      shares: [
        { memberId: "m", bps: 5000, amountInCents: 20000 },
        { memberId: "l", bps: 5000, amountInCents: 20000 },
      ],
    });
    expect(rows[1]).toMatchObject({
      expenseId: "2",
      ruleVersionId: "r1",
      shares: [
        { memberId: "m", bps: 5800, amountInCents: 58000 },
        { memberId: "l", bps: 4200, amountInCents: 42000 },
      ],
    });
    const sum = (id: string) =>
      rows.reduce((a, r) => a + (r.shares.find((s) => s.memberId === id)?.amountInCents ?? 0), 0);
    expect([sum("m"), sum("l")]).toEqual([78000, 62000]);
  });
  it("sem despesas => []", () => {
    expect(allocateBackfill({ period, members: [M, L], rules: [EQUAL], expenses: [] })).toEqual([]);
  });
});

describe("allocateBackfill: propriedade (2400 casos, semente fixa; valida a errata do ADR-016 §5.3)", () => {
  const rnd = mulberry32(2026);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  function universe() {
    const n = int(2, 4);
    const members: MemberInput[] = Array.from({ length: n }, (_, i) => ({
      id: `m${i}`,
      ordinal: i,
      joinedOn: i > 0 && rnd() < 0.3 ? "2026-10-15" : "2026-01-01",
      removedOn: i > 1 && rnd() < 0.3 ? "2026-10-20" : null,
    }));
    const rules: RuleInput[] = [EQUAL];
    const k = int(0, 2);
    for (let r = 0; r < k; r++) {
      const cuts = Array.from({ length: n - 1 }, () => int(0, 10000)).sort((a, b) => a - b);
      const bps = [
        cuts[0] as number,
        ...cuts.slice(1).map((c, x) => c - (cuts[x] as number)),
        10000 - (cuts[n - 2] as number),
      ];
      rules.push({
        id: `r${r + 1}`,
        kind: rnd() < 0.5 ? "EQUAL" : "PROPORTIONAL",
        effectiveFrom: `2026-10-${String(int(2, 25)).padStart(2, "0")}`,
        createdAt: `2026-10-0${r + 1}T00:00:00Z`,
        shares: members.map((m, x) => ({ memberId: m.id, bps: bps[x] as number })),
      });
    }
    const count = int(1, 14);
    const expenses = Array.from({ length: count }, (_, i) =>
      e(
        String(i + 1),
        rnd() < 0.7 ? 2 * int(1, 250000) + 1 : int(1, 500000),
        `m${int(0, n - 1)}`,
        `2026-10-${String(int(1, 28)).padStart(2, "0")}`,
      ),
    );
    return { members, rules, expenses };
  }
  it("R_m >= 0, Σ por membro = cota LEGACY, Σ por despesa = valor, ordem irrelevante, determinismo", () => {
    for (let c = 0; c < 2400; c++) {
      const u = universe();
      const input = { period, ...u };
      const rows = allocateBackfill(input);
      const legacy = computeSettlementLegacy({
        period,
        members: u.members,
        expenses: u.expenses,
        rules: u.rules,
        settlements: [],
      });
      expect(rows).toHaveLength(u.expenses.length);
      for (const row of rows) {
        const exp = u.expenses.find((x) => x.id === row.expenseId) as ExpenseInput;
        expect(row.shares.reduce((a, s) => a + s.amountInCents, 0)).toBe(exp.amountInCents);
        expect(row.shares.reduce((a, s) => a + s.bps, 0)).toBe(10000);
        expect(row.shares.every((s) => s.amountInCents >= 0)).toBe(true);
      }
      for (const m of legacy.members) {
        const total = rows.reduce(
          (a, r) => a + (r.shares.find((s) => s.memberId === m.memberId)?.amountInCents ?? 0),
          0,
        );
        expect(total).toBe(m.quotaInCents);
      }
      const shuffled = [...u.expenses].sort(() => rnd() - 0.5);
      expect(allocateBackfill({ ...input, expenses: shuffled })).toEqual(rows);
    }
  });
  it("EQUAL com 3 e 4 membros e totais grandes (o caso que quebrava o ADR-016 §5.3)", () => {
    const members: MemberInput[] = [0, 1, 2].map((i) => ({
      id: `m${i}`,
      ordinal: i,
      joinedOn: "2026-01-01",
    }));
    const expenses = [e("1", 316990, "m0"), e("2", 99999, "m1"), e("3", 1, "m2")];
    const rows = allocateBackfill({ period, members, rules: [EQUAL], expenses });
    const legacy = computeSettlementLegacy({
      period,
      members,
      expenses,
      rules: [EQUAL],
      settlements: [],
    });
    for (const m of legacy.members) {
      expect(
        rows.reduce(
          (a, r) => a + (r.shares.find((s) => s.memberId === m.memberId)?.amountInCents ?? 0),
          0,
        ),
      ).toBe(m.quotaInCents);
    }
    expect(rows[0]?.shares.map((s) => s.bps)).toEqual([3334, 3333, 3333]);
  });
});

describe("snapshotOf / diffSnapshots", () => {
  const result = computeSettlementLegacy({
    period: period as Period,
    members: [M, L],
    expenses: [e("1", 10000, "m")],
    rules: [EQUAL],
    settlements: [],
  });
  const snap = (): PeriodSnapshot => snapshotOf("2026-10", result, null, ["m", "l"]);
  it("idêntico => []", () => {
    expect(diffSnapshots(snap(), snap())).toEqual([]);
  });
  it("1 centavo na cota é detectado com o campo", () => {
    const b = snap();
    (b.members[0] as { quotaInCents: number }).quotaInCents += 1;
    const d = diffSnapshots(snap(), b);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: "members.m.quotaInCents" });
  });
  it("rótulo e status diferentes também são detectados", () => {
    const b = { ...snap(), label: "outro", status: "SETTLED" as const };
    expect(
      diffSnapshots(snap(), b)
        .map((x) => x.field)
        .sort(),
    ).toEqual(["label", "status"]);
  });
});
