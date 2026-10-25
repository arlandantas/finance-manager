import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { FAMILY_TABLES_DELETE_ORDER } from "@/modules/privacidade/delete-family";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";
import { tablesWithFamilyId } from "../support/pii";
import { seedEverything } from "../support/seed-all";

// SEC-017d (SDD-028 §7.5, US-081): excluir a família inteira, com a exceção controlada às travas de imutabilidade.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];
let fx: FamilyFixture; // Mariana (ADMIN) sozinha
let other: FamilyFixture; // Família Souza (Ana)
const mariana = () => fx.byName.Mariana?.as as Who;
const del = (as: Who | null, name: string, opts: { key?: string } = {}) =>
  at(() =>
    call(
      as,
      "POST",
      "/api/v1/family/delete",
      { confirmFamilyName: name },
      opts.key ? { idempotencyKey: opts.key } : undefined,
    ),
  );
const countsOf = async (familyId: string): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const t of await tablesWithFamilyId()) {
    const r = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "${t}" WHERE "familyId" = $1::uuid`,
      familyId,
    );
    out[t] = Number(r[0]?.n ?? 0);
  }
  return out;
};

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily({
    name: "Família Silva",
    members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
    splitEngine: "STORED",
  });
  other = await makeFamily({
    name: "Família Souza",
    members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    splitEngine: "STORED",
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("SEC-017d lista de tabelas", () => {
  it("a ordem de exclusão cobre TODAS as tabelas com familyId do banco (tabela nova reprova aqui)", async () => {
    const fromDb = await tablesWithFamilyId();
    expect([...FAMILY_TABLES_DELETE_ORDER].sort()).toEqual(fromDb.sort());
  });
});

describe("SEC-017d excluir a família", () => {
  it("apaga TUDO da família (count = 0 em todas as tabelas com familyId, incl. trilhas append-only); a outra família fica igual", async () => {
    await seedEverything(fx);
    await seedEverything(other);
    const grants = await oauthDance({ member: mariana() }); // conexão de assistente + auditoria
    expect((await toolCall(grants.accessToken, "consultar_contas")).status).toBe(200);
    const before = await countsOf(fx.family.id);
    // o teste só vale se cada tabela tinha dado
    for (const t of await tablesWithFamilyId())
      expect(before[t], `sem dado em ${t}`).toBeGreaterThan(0);
    const otherBefore = await countsOf(other.family.id);
    const usersBefore = await db.user.count();

    const r = await del(mariana(), "Família Silva");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: true });

    const after = await countsOf(fx.family.id);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    expect(await db.family.count({ where: { id: fx.family.id } })).toBe(0);
    expect(await countsOf(other.family.id)).toEqual(otherBefore);
    expect(await db.family.count({ where: { id: other.family.id } })).toBe(1);
    expect(await db.user.count()).toBe(usersBefore); // contas de usuário seguem
    // tabelas sem familyId que pendiam da família
    expect(await db.mcpToken.count()).toBe(0);
    expect(await db.splitShare.count({ where: { rule: { familyId: fx.family.id } } })).toBe(0);
    // a conexão de assistente morreu junto
    expect((await toolCall(grants.accessToken, "consultar_contas")).status).toBe(401);
  });

  it("recusa com outros membros ativos (409) e nada é apagado; membro comum não vê a ação (403)", async () => {
    const two = await makeFamily({ name: "Família Dois", uniqueEmails: true });
    const mari = two.byName.Mariana?.as as Who;
    const lucas = two.byName.Lucas?.as as Who;
    const before = await countsOf(two.family.id);
    const r = await del(mari, "Família Dois");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({
      code: "HAS_OTHER_MEMBERS",
      message: "Remova os outros membros antes de excluir a família.",
    });
    expect((await del(lucas, "Família Dois")).status).toBe(403);
    expect(await countsOf(two.family.id)).toEqual(before);
  });

  it("nome divergente => 422 e nada é apagado; vale o nome atual, com espaços nas pontas", async () => {
    await seedEverything(fx);
    const before = await countsOf(fx.family.id);
    const r = await del(mariana(), "Familia Silvo");
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({
      code: "NAME_MISMATCH",
      message: "O nome digitado não confere com o da família",
    });
    expect(await countsOf(fx.family.id)).toEqual(before);
    expect((await del(mariana(), "família silva")).status).toBe(422); // diferença de caixa/acento não vale
    expect((await del(mariana(), "  Família Silva  ")).status).toBe(200);
  });

  it("corpo com campo extra => 400; sem sessão => 401", async () => {
    expect(
      (
        await at(() =>
          call(mariana(), "POST", "/api/v1/family/delete", {
            confirmFamilyName: "Família Silva",
            x: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect((await del(null, "Família Silva")).status).toBe(401);
  });

  it("ex-membros ficam sem vínculo (a conta de usuário continua); convites pendentes deixam de valer; Mariana segue com a conta e pode criar outra família", async () => {
    // Lucas foi removido antes; vovó tem convite pendente
    const lucasUser = await db.user.create({
      data: { email: "lucas@exemplo.com", name: "Lucas Silva" },
    });
    const m = await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: lucasUser.id,
        role: "MEMBER",
        removedAt: new Date("2026-10-20T10:00:00Z"),
        removalKind: "REMOVED",
        removalNoticeAt: new Date("2026-10-21T10:00:00Z"),
      },
    });
    await db.familyEvent.create({
      data: {
        familyId: fx.family.id,
        type: "MEMBER_REMOVED",
        actorMemberId: fx.byName.Mariana?.memberId as string,
        targetMemberId: m.id,
        changes: {},
      },
    });
    const { makeInvitation } = await import("../support/factories");
    await makeInvitation(fx, { email: "vovo@exemplo.com", expiresAt: new Date("2027-01-01") });

    expect((await del(mariana(), "Família Silva")).status).toBe(200);

    expect(await db.member.count({ where: { userId: lucasUser.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: lucasUser.id } })).name).toBe(
      "Lucas Silva",
    );
    const vovo = await asUser("vovo@exemplo.com");
    expect((await at(() => call(vovo, "GET", "/api/v1/me/invitations"))).body.invitations).toEqual(
      [],
    );
    // Mariana: conta e sessão intactas; segue para o onboarding e cria uma nova família
    expect((await at(() => call(mariana(), "GET", "/api/v1/me"))).status).toBe(200);
    const created = await at(() =>
      call(mariana(), "POST", "/api/v1/families", { name: "Nova Silva", settlementEnabled: true }),
    );
    expect(created.status).toBe(201);
  });
});

describe("SEC-017d a exceção às travas é controlada", () => {
  const seedTx = async () => {
    await seedEverything(fx);
    await seedEverything(other);
  };
  const tryRaw = (sql: string, setting?: string) =>
    db.$transaction(async (tx) => {
      if (setting !== undefined)
        await tx.$executeRaw`SELECT set_config('app.purge_family', ${setting}, true)`;
      await tx.$executeRawUnsafe(sql);
    });

  it("sem a variável, DELETE/UPDATE em transactions, revisões, eventos, consentimentos e auditoria continuam proibidos", async () => {
    await seedTx();
    await oauthDance({ member: mariana() }); // gera mcp_audit_events
    for (const sql of [
      `DELETE FROM transactions`,
      `DELETE FROM transaction_revisions`,
      `UPDATE transaction_revisions SET revision = revision`,
      `DELETE FROM family_events`,
      `UPDATE family_events SET changes = '{}'::jsonb`,
      `DELETE FROM ai_consent_events`,
      `DELETE FROM mcp_audit_events`,
    ]) {
      await expect(tryRaw(sql), sql).rejects.toThrow(/append-only|imut/i);
    }
  });

  it("com a variável de OUTRA família, ou vazia, também não passa", async () => {
    await seedTx();
    for (const setting of [other.family.id, "", "nao-e-uuid"]) {
      await expect(
        tryRaw(`DELETE FROM transactions WHERE "familyId" = '${fx.family.id}'::uuid`, setting),
        `variável=${setting}`,
      ).rejects.toThrow(/append-only/);
      await expect(
        tryRaw(`DELETE FROM family_events WHERE "familyId" = '${fx.family.id}'::uuid`, setting),
      ).rejects.toThrow(/append-only/);
    }
  });

  it("com a variável da PRÓPRIA família só o DELETE das linhas dela passa; UPDATE segue proibido; a outra família não é apagada", async () => {
    await seedTx();
    await expect(
      tryRaw(
        `UPDATE family_events SET changes = '{}'::jsonb WHERE "familyId" = '${fx.family.id}'::uuid`,
        fx.family.id,
      ),
    ).rejects.toThrow(/append-only/);
    // DELETE sem filtro sob a variável de Silva: a 1ª linha de outra família barra a transação inteira
    await expect(tryRaw(`DELETE FROM transactions`, fx.family.id)).rejects.toThrow(/append-only/);
    expect(await db.transaction.count({ where: { familyId: other.family.id } })).toBeGreaterThan(0);
    expect(await db.transaction.count({ where: { familyId: fx.family.id } })).toBeGreaterThan(0);
  });

  it("depois da exclusão a trava volta (a variável vale só dentro da transação)", async () => {
    await seedTx();
    expect((await del(mariana(), "Família Silva")).status).toBe(200);
    await expect(db.$executeRaw`DELETE FROM transactions`).rejects.toThrow(/append-only/);
    const rows = await db.$queryRaw<
      Array<{ v: string | null }>
    >`SELECT current_setting('app.purge_family', true) AS v`;
    expect(rows[0]?.v ?? "").toBe("");
  });
});

describe("SEC-017d atomicidade, idempotência e concorrência", () => {
  it("falha no meio => rollback total (nada some)", async () => {
    await seedEverything(fx);
    const before = await countsOf(fx.family.id);
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER boom_t BEFORE DELETE ON categories FOR EACH ROW EXECUTE FUNCTION boom()`,
    );
    try {
      const r = await del(mariana(), "Família Silva");
      expect(r.status).toBe(500);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER boom_t ON categories`);
      await db.$executeRawUnsafe(`DROP FUNCTION boom()`);
    }
    expect(await countsOf(fx.family.id)).toEqual(before);
    expect(await db.family.count({ where: { id: fx.family.id } })).toBe(1);
  });

  it("mesma chave de idempotência em duplicidade: as duas respondem 200 e a exclusão acontece uma vez", async () => {
    await seedEverything(fx);
    const key = crypto.randomUUID();
    const rs = await Promise.all([
      del(mariana(), "Família Silva", { key }),
      del(mariana(), "Família Silva", { key }),
    ]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(rs[0]?.body).toEqual(rs[1]?.body);
    expect(await db.family.count({ where: { id: fx.family.id } })).toBe(0);
  });

  it("chaves diferentes ao mesmo tempo: uma exclui e a outra é recusada sem 500; outra família intacta", async () => {
    await seedEverything(fx);
    await seedEverything(other);
    const otherBefore = await countsOf(other.family.id);
    const rs = await Promise.all([
      del(mariana(), "Família Silva"),
      del(mariana(), "Família Silva"),
      del(mariana(), "Família Silva"),
    ]);
    const statuses = rs.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.every((s) => s === 200 || s === 403)).toBe(true);
    expect(await db.family.count({ where: { id: fx.family.id } })).toBe(0);
    expect(await countsOf(other.family.id)).toEqual(otherBefore);
  });

  it("escrita tardia da própria pessoa durante a exclusão não deixa órfãos (a FK barra; a exclusão vence)", async () => {
    const acct = await makeAccount(fx, {
      name: "Conta",
      owner: "Mariana",
      openingBalanceInCents: 100,
    });
    await makeTransaction(fx, {
      account: acct,
      category: "Supermercado",
      amountInCents: 10,
      occurredOn: "2026-10-01",
      author: "Mariana",
      payer: "Mariana",
      shared: false,
    });
    const invite = at(() =>
      call(mariana(), "POST", "/api/v1/invitations", { email: "novo@exemplo.com", role: "MEMBER" }),
    );
    const rs = await Promise.all([del(mariana(), "Família Silva"), invite]);
    expect(rs[0].status).toBe(200);
    expect(await db.family.count({ where: { id: fx.family.id } })).toBe(0);
    expect(Object.values(await countsOf(fx.family.id)).every((n) => n === 0)).toBe(true);
  });
});
