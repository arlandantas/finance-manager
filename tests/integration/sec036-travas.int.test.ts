import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

// SEC-036 (revisão de LGPD 2026-10-25, D-GES-46): funções de trava com search_path fixo e GUC de anonimização escopada.
const db = testDb();
let fx: FamilyFixture;
const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ name: "Família Silva" });
});

describe("SEC-036 search_path fixo nas funções de trava", () => {
  it("todas as funções de trava têm search_path = pg_catalog, public", async () => {
    const rows = await db.$queryRaw<Array<{ proname: string; proconfig: string[] | null }>>`
      SELECT proname, proconfig FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('purge_family_bypass','forbid_mutation','family_events_guard','ai_consent_append_only',
                        'mcp_audit_guard','tx_split_integrity','tx_sync_competence',
                        'installment_plan_paid_before_immutable')`;
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r.proconfig, r.proname).toContain("search_path=pg_catalog, public");
    }
  });
});

describe("SEC-036 app.anonymize_user é escopada ao titular", () => {
  async function seedEvents() {
    const mid = fx.byName.Mariana?.memberId as string;
    await db.familyEvent.create({
      data: {
        familyId: fx.family.id,
        type: "INVITATION_RESENT",
        actorMemberId: mid,
        changes: { email: "bob@exemplo.com", resendCount: 1 },
      },
    });
    await db.familyEvent.create({
      data: {
        familyId: fx.family.id,
        type: "FAMILY_RENAMED",
        actorMemberId: mid,
        changes: { to: "X" },
      },
    });
  }
  const run = (sql: string) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.anonymize_user', ${USER}, true)`;
      await tx.$executeRawUnsafe(sql);
    });

  it("troca só o e-mail pelo anonimizado DAQUELE titular, em INVITATION_RESENT", async () => {
    await seedEvents();
    await run(
      `UPDATE family_events SET changes = jsonb_set(changes, '{email}', to_jsonb('deleted+${USER}@invalid.local'::text)) WHERE type = 'INVITATION_RESENT'`,
    );
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "INVITATION_RESENT" } });
    expect(ev.changes).toEqual({ email: `deleted+${USER}@invalid.local`, resendCount: 1 });
  });

  it("não deixa mudar outro campo, outro e-mail, outro tipo de evento, nem sem a variável", async () => {
    await seedEvents();
    await expect(
      run(
        `UPDATE family_events SET changes = '{"email":"deleted+${USER}@invalid.local","resendCount":9}'::jsonb WHERE type = 'INVITATION_RESENT'`,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      run(
        `UPDATE family_events SET changes = jsonb_set(changes, '{email}', '"outro@x.com"') WHERE type = 'INVITATION_RESENT'`,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      run(`UPDATE family_events SET changes = '{"to":"Y"}'::jsonb WHERE type = 'FAMILY_RENAMED'`),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$executeRawUnsafe(
        `UPDATE family_events SET changes = jsonb_set(changes, '{email}', to_jsonb('deleted+${USER}@invalid.local'::text)) WHERE type = 'INVITATION_RESENT'`,
      ),
    ).rejects.toThrow(/append-only/);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "INVITATION_RESENT" } });
    expect(ev.changes).toEqual({ email: "bob@exemplo.com", resendCount: 1 });
  });
});
