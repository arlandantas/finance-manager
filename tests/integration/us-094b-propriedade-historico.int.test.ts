import { beforeAll, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { homePayables } from "@/modules/previstas/payables";
import { contextOf, migrateFamily } from "@/modules/split/migrate-family";
import { ledgerTotals } from "@/modules/transacoes/extrato";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, makeUnlinkedMember } from "../support/factories";
import { buildUniverse, snapshotFamily } from "../support/split-universe";

/**
 * US-094b AC3: o aceite nunca reescreve nada financeiro. 50 cadastros aleatórios (sementes fixas), motores LEGACY
 * (sementes ímpares) e STORED (pares): totais por mês, saldos, acerto do mês, "A pagar" e todas as `version`
 * (lançamentos, contas, cartões, previstas, séries) são idênticos antes e depois.
 */
const db = testDb();
const TODAY = "2026-12-15";
const NOW = "2026-12-15T15:00:00Z";
const SEEDS = Array.from({ length: Number(process.env.HARNESS_SEEDS_094B ?? 50) }, (_, i) => i + 1);

beforeAll(async () => {
  await resetDb();
  setMailer(new InMemoryMailer());
});

async function fingerprint(u: Awaited<ReturnType<typeof buildUniverse>>) {
  const familyId = u.fx.family.id;
  const ctx = contextOf(familyId, TODAY);
  const base = await snapshotFamily(u, TODAY); // acerto por mês, saldos, versões de 4 tabelas
  const extra = await db.$transaction(async (tx) => ({
    totals: await Promise.all(
      u.months.map((m) =>
        ledgerTotals(tx, { familyId, start: `${m}-01`, end: `${m}-28`, includeDeleted: false }),
      ),
    ),
    payables: await homePayables(tx, { ...ctx, memberId: u.fx.members[0]?.memberId as string }),
    series: [
      ...(await tx.recurringExpense.findMany({
        where: { familyId },
        select: { id: true, version: true },
      })),
      ...(await tx.installmentPlan.findMany({
        where: { familyId },
        select: { id: true, version: true },
      })),
    ].sort((a, b) => a.id.localeCompare(b.id)),
  }));
  return { base, extra };
}

describe("US-094b: o aceite preserva todo o histórico financeiro", () => {
  it("antes == depois em 50 cadastros, motores STORED e LEGACY", async () => {
    let stored = 0;
    let owned = 0;
    let checked = 0;
    for (const seed of SEEDS) {
      const u = await buildUniverse(seed, { unlinked: 1 });
      if (seed % 2 === 0) {
        await db.$transaction((tx) => migrateFamily(tx, u.fx.family.id, { today: TODAY }), {
          timeout: 120_000,
        });
        stored += 1;
      }
      const edu = await db.member.findFirstOrThrow({
        where: { familyId: u.fx.family.id, userId: null },
      });
      if (edu.removedAt) {
        // o universo o removeu no meio do tempo: reativa o cadastro (sem tocar em nada financeiro)
        await db.member.update({
          where: { id: edu.id },
          data: { removedAt: null, removedByMemberId: null, removalKind: null },
        });
      }
      checked += 1;
      owned += await db.transaction.count({
        where: { familyId: u.fx.family.id, payerMemberId: edu.id },
      });
      const email = `edu${seed}@exemplo.com`;
      await db.member.update({ where: { id: edu.id }, data: { pendingEmail: email } });
      const admin = u.fx.members[0]?.as ?? null;
      const inv = await withClock(NOW, () =>
        call(admin, "POST", `/api/v1/members/${edu.id}/invitations`, { email }),
      );
      expect(inv.status, `seed ${seed}`).toBe(201);
      const before = await fingerprint(u);
      const guest = await asUser(email, { name: "Edu Google" });
      const res = await withClock(NOW, () =>
        call(guest, "POST", `/api/v1/me/invitations/${inv.body.invitation.id}/accept`, {
          name: `Eduardo ${seed}`,
        }),
      );
      expect(res.status, `seed ${seed}`).toBe(200);
      expect(await fingerprint(u), `seed ${seed}`).toEqual(before);
      expect((await db.member.findUniqueOrThrow({ where: { id: edu.id } })).userId).toBe(
        guest.userId,
      );
    }
    expect(checked).toBeGreaterThanOrEqual(SEEDS.length);
    expect(stored).toBeGreaterThanOrEqual(Math.floor(SEEDS.length / 2));
    expect(owned).toBeGreaterThan(0); // o cadastro realmente tem histórico em parte das famílias
  }, 1_800_000);
});
