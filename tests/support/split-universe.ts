import { testDb } from "./db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTransaction,
  makeUnlinkedMember,
} from "./factories";
import { mulberry32 } from "./prng";

/**
 * Universo aleatório do harness da EN-002b (SDD-015 §8.1): uma família LEGACY por semente, com 2..4
 * membros, entrada e saída no meio do tempo, regras EQUAL/PROPORTIONAL com troca em dia aleatório e regra
 * futura, despesas de 1 a 500000 centavos (maioria ÍMPAR), pagadores aleatórios, excluídas, compras de
 * cartão compartilhadas e acertos parciais/totais em 3 a 6 meses. Determinístico por semente.
 */
export type Universe = {
  fx: FamilyFixture;
  seed: number;
  memberCount: number;
  months: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export async function buildUniverse(
  seed: number,
  opts: { unlinked?: number } = {},
): Promise<Universe> {
  const db = testDb();
  const rnd = mulberry32(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const linked = int(2, 4);
  const k = opts.unlinked ?? 0; // US-092a (SDD-033 §8.3): até 2 membros sem conta por família
  const linkedNames = ["Ana", "Beto", "Carla", "Davi"].slice(0, linked);
  const fx = await makeFamily({
    name: `Família ${seed}`,
    uniqueEmails: true,
    splitEngine: "LEGACY",
    members: linkedNames.map((name, i) => ({
      email: `${name.toLowerCase()}@exemplo.com`,
      name: `${name} Silva`,
      role: i === 0 ? ("ADMIN" as const) : ("MEMBER" as const),
    })),
  });
  // sem conta: depois dos vinculados, mesma regra de ids e nomes de qualquer membro (o motor não distingue)
  const unlinkedNames = ["Edu", "Fabi"].slice(0, k);
  for (const name of unlinkedNames) await makeUnlinkedMember(fx, { name, register: true });
  const names = [...linkedNames, ...unlinkedNames];
  const n = names.length;
  const authorOf = (p: string) => (linkedNames.includes(p) ? p : (names[0] as string)); // quem lança tem conta
  const acc: AccountFixture = await makeAccount(fx, {
    name: "Conta",
    owner: names[0] as string,
    openingBalanceInCents: 50_000_000,
  });
  const card: CardFixture = await makeCard(fx, {
    name: "Cartão",
    owner: names[0] as string,
    limitInCents: 900_000_000,
    closingDay: int(5, 25),
    dueDay: 5,
  });

  const monthCount = int(3, 6);
  const startMonth = int(0, 2); // ago/set/out de 2026
  const months = Array.from({ length: monthCount }, (_, i) => {
    const m = 8 + startMonth + i;
    return `${2026 + Math.floor((m - 1) / 12)}-${pad(((m - 1) % 12) + 1)}`;
  });

  // entrada no meio do tempo e saída de membros (ADR-019)
  for (let i = 1; i < n; i++) {
    const member = fx.members[i];
    if (!member) continue;
    if (rnd() < 0.3) {
      const m = months[int(0, monthCount - 1)] as string;
      await db.member.update({
        where: { id: member.memberId },
        data: { joinedAt: new Date(`${m}-${pad(int(2, 25))}T12:00:00Z`) },
      });
    }
    if (i >= 2 && rnd() < 0.3) {
      const m = months[int(1, monthCount - 1)] as string;
      await db.member.update({
        where: { id: member.memberId },
        data: { removedAt: new Date(`${m}-${pad(int(2, 25))}T12:00:00Z`), removalKind: "REMOVED" },
      });
    }
  }

  // regras: troca em dia aleatório e uma regra futura
  const ruleCount = int(0, 2);
  for (let r = 0; r < ruleCount; r++) {
    const m = months[int(0, monthCount - 1)] as string;
    const cuts = Array.from({ length: n - 1 }, () => int(0, 10000)).sort((a, b) => a - b);
    const bps = [
      cuts[0] as number,
      ...cuts.slice(1).map((c, x) => c - (cuts[x] as number)),
      10000 - (cuts[n - 2] as number),
    ];
    await db.splitRuleVersion.create({
      data: {
        familyId: fx.family.id,
        kind: rnd() < 0.5 ? "EQUAL" : "PROPORTIONAL",
        effectiveFrom: new Date(`${m}-${pad(int(2, 27))}T00:00:00Z`),
        shares: {
          create: fx.members.map((mm, x) => ({ memberId: mm.memberId, bps: bps[x] as number })),
        },
      },
    });
  }
  if (rnd() < 0.4) {
    await db.splitRuleVersion.create({
      data: {
        familyId: fx.family.id,
        kind: "EQUAL",
        effectiveFrom: new Date("2027-03-01T00:00:00Z"),
      },
    });
  }

  // despesas
  let t = 0;
  for (const month of months) {
    const count = int(0, 7);
    for (let i = 0; i < count; i++) {
      const payer = names[int(0, n - 1)] as string;
      const odd = rnd() < 0.7;
      const amount = odd ? 2 * int(0, 249999) + 1 : int(1, 500000);
      const on = `${month}-${pad(int(1, 28))}`;
      const deleted = rnd() < 0.1;
      const shared = rnd() < 0.78;
      const createdAt = new Date(Date.UTC(2026, 0, 1, 12, 0, ++t));
      if (rnd() < 0.2) {
        await makeCardPurchase(fx, {
          card,
          amountInCents: amount,
          occurredOn: on,
          payer,
          author: authorOf(payer),
          shared,
          deleted,
          createdAt,
        });
      } else {
        await makeTransaction(fx, {
          account: acc,
          category: "Supermercado",
          amountInCents: amount,
          occurredOn: on,
          payer,
          author: authorOf(payer),
          shared,
          deleted,
          createdAt,
        });
      }
    }
  }

  // acertos parciais e totais registrados (sem depender das sugestões: o motor só lê as pernas e os membros)
  for (const month of months) {
    if (rnd() < 0.35 && n >= 2) {
      const from = int(0, n - 1);
      let to = int(0, n - 1);
      if (to === from) to = (to + 1) % n;
      const amount = int(100, 80000);
      const group = await db.transferGroup.create({
        data: {
          familyId: fx.family.id,
          kind: "SETTLEMENT",
          occurredOn: new Date(`${month}-28T00:00:00Z`),
          authorMemberId: fx.members[from]?.memberId as string,
          settlementPeriod: month,
          settlementFromMemberId: fx.members[from]?.memberId as string,
          settlementToMemberId: fx.members[to]?.memberId as string,
        },
      });
      for (const kind of ["TRANSFER_OUT", "TRANSFER_IN"] as const) {
        await db.transaction.create({
          data: {
            familyId: fx.family.id,
            kind,
            direction: kind === "TRANSFER_OUT" ? "DEBIT" : "CREDIT",
            accountId: acc.id,
            amountInCents: BigInt(amount),
            occurredOn: new Date(`${month}-28T00:00:00Z`),
            description: "Acerto",
            authorMemberId: fx.members[from]?.memberId as string,
            transferGroupId: group.id,
          },
        });
      }
    }
  }
  return { fx, seed, memberCount: n, months };
}

/**
 * Fotografia da família para o antes/depois da 094b (SDD-033 §8.3): totais e acerto por mês (motor), saldos das
 * contas, o "A pagar", as `version`s de contas/cartões/previstas/lançamentos e as contagens de membros e splits.
 */
export async function snapshotFamily(u: Universe, today: string) {
  const db = testDb();
  const familyId = u.fx.family.id;
  const { contextOf, snapshotPeriod } = await import("@/modules/split/migrate-family");
  const { accountBalances } = await import("@/modules/contas/ledger-queries");
  const ctx = contextOf(familyId, today);
  const periods = await db.$transaction(async (tx) => {
    const out = [];
    for (const key of u.months) out.push(await snapshotPeriod(tx, ctx, key, today));
    return out;
  });
  const balances = await db.$transaction(async (tx) =>
    [...(await accountBalances(tx as never, familyId)).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  const versions = async (rows: Promise<Array<{ id: string; version: number }>>) =>
    (await rows).map((r) => [r.id, r.version]).sort();
  return {
    periods,
    balances,
    versions: {
      accounts: await versions(
        db.bankAccount.findMany({ where: { familyId }, select: { id: true, version: true } }),
      ),
      cards: await versions(
        db.creditCard.findMany({ where: { familyId }, select: { id: true, version: true } }),
      ),
      planned: await versions(
        db.plannedExpense.findMany({ where: { familyId }, select: { id: true, version: true } }),
      ),
      transactions: await versions(
        db.transaction.findMany({ where: { familyId }, select: { id: true, version: true } }),
      ),
    },
    members: await db.member.count({ where: { familyId } }),
    splits: await db.transactionSplit.count({ where: { transaction: { familyId } } }),
  };
}
