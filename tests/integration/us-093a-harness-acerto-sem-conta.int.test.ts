import { beforeAll, describe, expect, it } from "vitest";
import { contextOf } from "@/modules/split/migrate-family";
import { loadSettlement, registerSettlement } from "@/modules/split/service";
import { resetDb, testDb } from "../support/db";
import { makeAccount } from "../support/factories";
import { buildUniverse } from "../support/split-universe";

/**
 * US-093a (SDD-034 §7.2-6): harness do EN-002b com 2 membros sem conta por família (sementes 1..240).
 * A regressão LEGACY ➜ STORED já é a da 092a (`us-092a-harness-sem-conta`); aqui: (b) Σ (pagou − cota) = 0 e toda sugestão
 * que envolve um sem conta é positiva e ≤ |saldo|; (c) registrar o acerto de uma sugestão com credor sem conta,
 * para uma conta que NÃO é do devedor, move os saldos do devedor e do credor exatamente pelo valor (destino livre, D-034-7).
 */
const db = testDb();
const TODAY = "2026-12-15";
const SEEDS = Array.from({ length: Number(process.env.HARNESS_SEEDS ?? 240) }, (_, i) => i + 1);

beforeAll(async () => {
  await resetDb();
});

describe("US-093a: acerto com membros sem conta (propriedades por período)", () => {
  it("Σ diferenças = 0, sugestões coerentes e acerto com destino livre quita a sugestão", async () => {
    let checkedSuggestions = 0;
    let settled = 0;
    for (const seed of SEEDS) {
      const u = await buildUniverse(seed, { unlinked: 2 });
      const familyId = u.fx.family.id;
      const unlinked = new Set(
        (await db.member.findMany({ where: { familyId, userId: null }, select: { id: true } })).map(
          (m) => m.id,
        ),
      );
      const admin = u.fx.members[0]?.memberId as string;
      const ctx = { ...contextOf(familyId, TODAY), memberId: admin };
      const spare = await makeAccount(u.fx, { name: "Poupança do sem conta", owner: "Edu" });
      let did = false;
      for (const key of u.months) {
        const l = await db.$transaction((tx) => loadSettlement(tx, ctx, key));
        const { members, suggestions } = l.result;
        // Σ (pagou − cota) = 0 sempre (as cotas somam o total comum); o saldo inclui os acertos já registrados
        expect(
          members.reduce((s, m) => s + m.differenceInCents, 0),
          `seed ${seed} ${key}: Σ diferença`,
        ).toBe(0);
        const bal = new Map(members.map((m) => [m.memberId, m.balanceInCents]));
        for (const s of suggestions) {
          expect(s.amountInCents, `seed ${seed} ${key}`).toBeGreaterThan(0);
          if (unlinked.has(s.toMemberId)) {
            checkedSuggestions += 1;
            expect(s.amountInCents).toBeLessThanOrEqual(Math.abs(bal.get(s.fromMemberId) ?? 0));
          }
        }
        const target = suggestions.find((s) => unlinked.has(s.toMemberId));
        if (!did && target) {
          const accountOfDebtor = await db.bankAccount.findFirstOrThrow({
            where: { familyId, name: "Conta" },
          });
          await db.$transaction((tx) =>
            registerSettlement(tx, ctx, {
              period: key,
              fromMemberId: target.fromMemberId,
              toMemberId: target.toMemberId,
              amountInCents: target.amountInCents,
              fromAccountId: accountOfDebtor.id,
              toAccountId: spare.id,
            }),
          );
          const after = await db.$transaction((tx) => loadSettlement(tx, ctx, key));
          const balOf = (r: typeof l.result, id: string) =>
            r.members.find((m) => m.memberId === id)?.balanceInCents ?? 0;
          expect(
            balOf(after.result, target.fromMemberId) - balOf(l.result, target.fromMemberId),
            `seed ${seed} ${key}: devedor`,
          ).toBe(target.amountInCents);
          expect(
            balOf(l.result, target.toMemberId) - balOf(after.result, target.toMemberId),
            `seed ${seed} ${key}: credor sem conta`,
          ).toBe(target.amountInCents);
          did = true;
          settled += 1;
        }
      }
    }
    expect(checkedSuggestions).toBeGreaterThan(SEEDS.length / 4);
    expect(settled).toBeGreaterThan(SEEDS.length / 8);
  }, 1_800_000);
});
