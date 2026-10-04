import { describe, expect, it } from "vitest";
import { periodFromKey } from "@/lib/period";
import type { RuleInput } from "@/modules/split/rules";
import {
  computeSettlement,
  type ExpenseInput,
  type MemberInput,
  type SettledInput,
  type SettlementInput,
} from "@/modules/split/settlement";

const period = periodFromKey("2026-10");
const M: MemberInput = { id: "m", ordinal: 0, joinedOn: "2026-01-01" };
const L: MemberInput = { id: "l", ordinal: 1, joinedOn: "2026-01-01" };
const X: MemberInput = { id: "x", ordinal: 2, joinedOn: "2026-01-01" };
const EQUAL: RuleInput = {
  id: "r0",
  kind: "EQUAL",
  effectiveFrom: "1970-01-01",
  createdAt: "2026-01-01T00:00:00Z",
  shares: [],
};
const prop = (id: string, from: string, shares: Array<[string, number]>): RuleInput => ({
  id,
  kind: "PROPORTIONAL",
  effectiveFrom: from,
  createdAt: "2026-02-01T00:00:00Z",
  shares: shares.map(([memberId, bps]) => ({ memberId, bps })),
});
let n = 0;
const exp = (payer: string, amount: number, occurredOn = "2026-10-10"): ExpenseInput => ({
  id: `e${++n}`,
  amountInCents: amount,
  payerMemberId: payer,
  occurredOn,
});
const base = (o: Partial<SettlementInput> = {}): SettlementInput => ({
  period,
  members: [M, L],
  expenses: [],
  rules: [EQUAL],
  settlements: [],
  ...o,
});
const s1Expenses = () => [exp("m", 200000), exp("m", 40000), exp("l", 120000), exp("l", 40000)];
const row = (r: ReturnType<typeof computeSettlement>, id: string) =>
  r.members.find((m) => m.memberId === id) as NonNullable<(typeof r.members)[number]>;

describe("US-009 computeSettlement: vetores S1..S13 (SDD-002 §4.7)", () => {
  it("S1: EQUAL, L deve 40000 a M", () => {
    const r = computeSettlement(base({ expenses: s1Expenses() }));
    expect(r.totalSharedInCents).toBe(400000);
    expect(row(r, "m")).toMatchObject({ quotaInCents: 200000, differenceInCents: 40000 });
    expect(row(r, "l")).toMatchObject({ quotaInCents: 200000, differenceInCents: -40000 });
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 40000 }]);
    expect(r.status).toBe("PENDING");
  });

  it("S2: PROPORTIONAL 6000/4000", () => {
    const r = computeSettlement(
      base({
        rules: [
          prop("p", "1970-01-01", [
            ["m", 6000],
            ["l", 4000],
          ]),
        ],
        expenses: [exp("m", 100000)],
      }),
    );
    expect(row(r, "m").quotaInCents).toBe(60000);
    expect(row(r, "l").quotaInCents).toBe(40000);
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 40000 }]);
  });

  it("S3: centavo ímpar vai ao menor ordinal; Σ = total", () => {
    const r = computeSettlement(base({ expenses: [exp("m", 10001)] }));
    expect(row(r, "m").quotaInCents).toBe(5001);
    expect(row(r, "l").quotaInCents).toBe(5000);
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 5000 }]);
  });

  it("S4: 3 membros, duas sugestões (empate pelo ordinal)", () => {
    const r = computeSettlement(base({ members: [M, L, X], expenses: [exp("m", 90000)] }));
    expect(r.members.map((m) => m.quotaInCents)).toEqual([30000, 30000, 30000]);
    expect(row(r, "m").differenceInCents).toBe(60000);
    expect(r.suggestions).toEqual([
      { fromMemberId: "l", toMemberId: "m", amountInCents: 30000 },
      { fromMemberId: "x", toMemberId: "m", amountInCents: 30000 },
    ]);
  });

  it("S5: ambos pagaram 50000 => BALANCED", () => {
    const r = computeSettlement(base({ expenses: [exp("m", 50000), exp("l", 50000)] }));
    expect(r.status).toBe("BALANCED");
    expect(r.suggestions).toEqual([]);
  });

  it("S6: sem despesas => EMPTY", () => {
    const r = computeSettlement(base());
    expect(r.status).toBe("EMPTY");
    expect(r.suggestions).toEqual([]);
    expect(r.totalSharedInCents).toBe(0);
  });

  it("S7: 1 membro => NEEDS_MORE_MEMBERS", () => {
    const r = computeSettlement(base({ members: [M], expenses: [exp("m", 1000)] }));
    expect(r.status).toBe("NEEDS_MORE_MEMBERS");
    expect(r.suggestions).toEqual([]);
  });

  it("S8: vigência: regra muda em 15/10", () => {
    const r = computeSettlement(
      base({
        rules: [
          EQUAL,
          prop("p", "2026-10-15", [
            ["m", 7000],
            ["l", 3000],
          ]),
        ],
        expenses: [exp("m", 50000, "2026-10-10"), exp("m", 100000, "2026-10-20")],
      }),
    );
    expect(row(r, "m").quotaInCents).toBe(25000 + 70000);
    expect(row(r, "l").quotaInCents).toBe(25000 + 30000);
    expect(row(r, "m").differenceInCents).toBe(55000);
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 55000 }]);
  });

  const settle = (amount: number): SettledInput[] => [
    { fromMemberId: "l", toMemberId: "m", amountInCents: amount },
  ];

  it("S9: acerto parcial de 15000 => L deve 25000", () => {
    const r = computeSettlement(base({ expenses: s1Expenses(), settlements: settle(15000) }));
    expect(row(r, "m").balanceInCents).toBe(25000);
    expect(row(r, "l").balanceInCents).toBe(-25000);
    expect(row(r, "l").settledAdjustmentInCents).toBe(15000);
    expect(row(r, "m").settledAdjustmentInCents).toBe(-15000);
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 25000 }]);
    expect(r.status).toBe("PENDING");
  });

  it("S10: acerto de 40000 => SETTLED, saldos 0", () => {
    const r = computeSettlement(base({ expenses: s1Expenses(), settlements: settle(40000) }));
    expect(r.status).toBe("SETTLED");
    expect(r.members.every((m) => m.balanceInCents === 0)).toBe(true);
    expect(r.suggestions).toEqual([]);
  });

  it("S11: nova despesa comum de 20000 após quitar => L deve 10000", () => {
    const r = computeSettlement(
      base({ expenses: [...s1Expenses(), exp("m", 20000)], settlements: settle(40000) }),
    );
    expect(r.suggestions).toEqual([{ fromMemberId: "l", toMemberId: "m", amountInCents: 10000 }]);
  });

  it("S12: inversão de sentido após excluir despesa de 40000 da M", () => {
    const r = computeSettlement(
      base({
        expenses: [exp("m", 200000), exp("l", 120000), exp("l", 40000)],
        settlements: settle(40000),
      }),
    );
    expect(r.totalSharedInCents).toBe(360000);
    expect(row(r, "m")).toMatchObject({
      quotaInCents: 180000,
      differenceInCents: 20000,
      settledAdjustmentInCents: -40000,
      balanceInCents: -20000,
    });
    expect(row(r, "l")).toMatchObject({ differenceInCents: -20000, balanceInCents: 20000 });
    expect(r.suggestions).toEqual([{ fromMemberId: "m", toMemberId: "l", amountInCents: 20000 }]);
  });

  it("S13: regra PROPORTIONAL sem o membro novo: cota dele = 0", () => {
    const r = computeSettlement(
      base({
        members: [M, L, X],
        rules: [
          prop("p", "1970-01-01", [
            ["m", 6000],
            ["l", 4000],
          ]),
        ],
        expenses: [exp("m", 100000)],
      }),
    );
    expect(row(r, "x").quotaInCents).toBe(0);
    expect(row(r, "m").quotaInCents).toBe(60000);
  });

  it("EQUAL considera só membros que entraram até o fim do período (fallback: todos)", () => {
    const late: MemberInput = { id: "x", ordinal: 2, joinedOn: "2026-11-05" };
    const r = computeSettlement(base({ members: [M, L, late], expenses: [exp("m", 10000)] }));
    expect(row(r, "x").quotaInCents).toBe(0);
    expect(row(r, "m").quotaInCents).toBe(5000);
    const allLate = computeSettlement(
      base({
        members: [
          { ...M, joinedOn: "2027-01-01" },
          { ...L, joinedOn: "2027-01-01" },
        ],
        expenses: [exp("m", 10000)],
      }),
    );
    expect(allLate.members.map((m) => m.quotaInCents)).toEqual([5000, 5000]);
  });

  it("acerto sem despesas no período: SETTLED/PENDING em vez de EMPTY", () => {
    const r = computeSettlement(base({ settlements: settle(100) }));
    expect(r.status).toBe("PENDING"); // saldo remanescente invertido
  });
});

// Gerador pseudoaleatório com semente fixa (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

describe("US-009 computeSettlement: propriedades (semente fixa)", () => {
  it("Σ quota = total, Σ diferença = 0, Σ saldo = 0, sugestões zeram saldos, ≤ N-1, valores > 0, ordem irrelevante", () => {
    const rand = rng(2026);
    for (let c = 0; c < 400; c++) {
      const count = 2 + Math.floor(rand() * 4);
      const members: MemberInput[] = Array.from({ length: count }, (_, i) => ({
        id: `m${i}`,
        ordinal: i,
        joinedOn: "2026-01-01",
      }));
      const w = members.map(() => Math.floor(rand() * 10000));
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      const bps = w.map((x) => Math.floor((x * 10000) / sum));
      bps[0] = (bps[0] as number) + (10000 - bps.reduce((a, b) => a + b, 0));
      const rules: RuleInput[] = [
        EQUAL,
        prop(
          "p",
          "2026-10-15",
          members.map((m, i) => [m.id, bps[i] as number] as [string, number]),
        ),
      ];
      const expenses: ExpenseInput[] = Array.from({ length: Math.floor(rand() * 12) }, (_, i) => ({
        id: `e${c}-${i}`,
        amountInCents: 1 + Math.floor(rand() * 500000),
        payerMemberId: `m${Math.floor(rand() * count)}`,
        occurredOn: `2026-10-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
      }));
      const input: SettlementInput = { period, members, expenses, rules, settlements: [] };
      const r = computeSettlement(input);
      const total = expenses.reduce((a, e) => a + e.amountInCents, 0);
      expect(r.totalSharedInCents).toBe(total);
      expect(r.members.reduce((a, m) => a + m.quotaInCents, 0)).toBe(total);
      expect(r.members.reduce((a, m) => a + m.differenceInCents, 0)).toBe(0);
      expect(r.members.reduce((a, m) => a + m.balanceInCents, 0)).toBe(0);
      expect(r.suggestions.length).toBeLessThanOrEqual(count - 1);
      for (const s of r.suggestions) expect(s.amountInCents).toBeGreaterThan(0);

      const applied = computeSettlement({
        ...input,
        settlements: r.suggestions.map((s) => ({ ...s })),
      });
      expect(applied.members.every((m) => m.balanceInCents === 0)).toBe(true);

      const shuffled = computeSettlement({
        ...input,
        members: shuffle(members, rand),
        expenses: shuffle(expenses, rand),
        rules: shuffle(rules, rand),
      });
      expect(shuffled).toEqual(r);
    }
  });
});
