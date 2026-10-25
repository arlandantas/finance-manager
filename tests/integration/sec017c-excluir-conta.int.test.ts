import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { DELETED_ACCOUNT_NAME, memberLabel } from "@/lib/deleted-account";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeInvitation,
  makeTransaction,
} from "../support/factories";
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";
import { findResidue } from "../support/pii";

// SEC-017c (SDD-028 §7.4, US-080): excluir a minha conta = sair da família + anonimizar a identidade.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];
const lucas = () => fx.byName.Lucas?.as as Who;
const mariana = () => fx.byName.Mariana?.as as Who;
const mid = (n: string) => fx.byName[n]?.memberId as string;
const del = (as: Who | null, body: Record<string, unknown> = {}, opts: { key?: string } = {}) =>
  at(() =>
    call(
      as,
      "POST",
      "/api/v1/me/delete-account",
      { confirmEmail: as?.email, ...body },
      opts.key ? { idempotencyKey: opts.key } : undefined,
    ),
  );

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily({ name: "Família Silva" });
});
afterEach(() => vi.unstubAllGlobals());

describe("SEC-017c pré-condições e confirmação", () => {
  it("e-mail digitado diferente => 422 e nada muda", async () => {
    const r = await del(lucas(), { confirmEmail: "outro@exemplo.com" });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("EMAIL_MISMATCH");
    const u = await db.user.findUniqueOrThrow({ where: { id: lucas().userId } });
    expect(u).toMatchObject({ email: "lucas@exemplo.com", name: "Lucas Silva", deletedAt: null });
    expect(await db.session.count({ where: { userId: lucas().userId } })).toBeGreaterThan(0);
  });

  it("confirmação ignora caixa e espaços", async () => {
    const r = await del(lucas(), { confirmEmail: "  LUCAS@Exemplo.com " });
    expect(r.status).toBe(200);
  });

  it("corpo com campo desconhecido => 400", async () => {
    expect((await del(lucas(), { extra: 1 })).status).toBe(400);
  });

  it("Administrador único com outros membros ativos => 409 LAST_ADMIN, conta intacta", async () => {
    const r = await del(mariana());
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({
      code: "LAST_ADMIN",
      message: "Passe a administração para outra pessoa antes de excluir sua conta.",
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: mariana().userId } })).deletedAt,
    ).toBeNull();
    expect(await db.member.count({ where: { removedAt: null } })).toBe(2);
  });

  it("único membro ativo => 409 SOLE_MEMBER", async () => {
    const solo = await makeFamily({
      name: "Família Souza",
      members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    });
    const r = await del(solo.members[0]?.as as Who);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({
      code: "SOLE_MEMBER",
      message: "Você é a única pessoa na família. Exclua a família antes de excluir sua conta.",
    });
  });

  it("conta com saldo exige reatribuir a titularidade; com o mapa, avança e a conta passa a outra pessoa", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 300000,
    });
    const blocked = await del(lucas());
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("REMOVAL_BLOCKED");
    expect(blocked.body.error.message).toBe(
      "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro.",
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: lucas().userId } })).deletedAt,
    ).toBeNull();
    const ok = await del(lucas(), {
      reassign: { accounts: { [itau.id]: mid("Mariana") }, cards: {} },
    });
    expect(ok.status).toBe(200);
    expect((await db.bankAccount.findUniqueOrThrow({ where: { id: itau.id } })).ownerMemberId).toBe(
      mid("Mariana"),
    );
  });
});

describe("SEC-017c exclusão", () => {
  it("anonimiza a identidade, sai da família e preserva o histórico (totais iguais; 'ex-membro (conta excluída)')", async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 15050,
      occurredOn: "2026-10-10",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    const before = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    const blocked = await del(lucas()); // acerto em aberto: a saída da família (US-035) exige reconhecer
    expect(blocked.status).toBe(422);
    const r = await del(lucas(), { acknowledgeSettlement: true });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ deleted: true });

    const u = await db.user.findUniqueOrThrow({ where: { id: lucas().userId } });
    expect(u).toMatchObject({
      name: DELETED_ACCOUNT_NAME,
      email: `deleted+${lucas().userId}@invalid.local`,
      image: null,
      emailVerified: null,
    });
    expect(u.deletedAt).not.toBeNull();
    const m = await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } });
    expect(m).toMatchObject({ removalKind: "LEFT" });
    expect(m.removedAt).not.toBeNull();
    expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);

    const after = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(after.body.totals).toEqual(before.body.totals);
    const row = after.body.items.find((i: { type: string }) => i.type === "EXPENSE");
    expect(row.payer).toMatchObject({ name: "Conta excluída", removed: true });
    expect(memberLabel(row.payer)).toBe("ex-membro (conta excluída)");
    expect(JSON.stringify(after.body)).not.toContain("lucas@exemplo.com");
  });

  it("reteste de LGPD: nenhuma coluna de nenhuma tabela guarda o nome, o e-mail ou o token do titular", async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 1000,
    });
    await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 500,
      occurredOn: "2026-10-10",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    // rastros técnicos do titular: sessão extra, conta Google, token de verificação, convites e idempotência
    const second = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    await db.account.create({
      data: {
        userId: lucas().userId,
        type: "oidc",
        provider: "google",
        providerAccountId: "g-123",
      },
    });
    await db.verificationToken.create({
      data: {
        identifier: "lucas@exemplo.com",
        token: "tok-lucas",
        expires: new Date("2027-01-01"),
      },
    });
    await makeInvitation(fx, { email: "lucas@exemplo.com", status: "ACCEPTED" });
    await makeInvitation(fx, { email: "lucas@exemplo.com", status: "DECLINED" });
    await db.familyEvent.create({
      data: {
        familyId: fx.family.id,
        type: "INVITATION_RESENT",
        actorMemberId: mid("Mariana"),
        changes: { email: "lucas@exemplo.com", resendCount: 1 },
      },
    });
    await at(() => call(lucas(), "GET", "/api/v1/accounts")); // gera registros de uso
    await at(() => call(lucas(), "POST", "/api/v1/me/sessions/revoke-others", {})); // idempotency_records
    void second;
    expect(Object.keys(await findResidue(["lucas@exemplo.com", "Lucas Silva"]))).not.toEqual([]); // antes: há rastros

    const sessionToken = lucas().cookie.split("=")[1] as string;
    expect((await del(lucas(), { acknowledgeSettlement: true })).status).toBe(200);

    const residue = await findResidue([
      "lucas@exemplo.com",
      "Lucas Silva",
      "tok-lucas",
      "g-123",
      sessionToken,
    ]);
    expect(residue).toEqual({});
    expect(await db.session.count({ where: { userId: lucas().userId } })).toBe(0);
    expect(await db.account.count({ where: { userId: lucas().userId } })).toBe(0);
    expect(await db.verificationToken.count()).toBe(0);
    expect(
      await db.idempotencyRecord.count({ where: { requestHash: { not: "account-deleted" } } }),
    ).toBe(await db.idempotencyRecord.count({ where: { userId: mariana().userId } }));
  });

  it("encerra sessões de todos os aparelhos; a de outra pessoa continua", async () => {
    const phone = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    expect((await at(() => call(phone, "GET", "/api/v1/me"))).status).toBe(200);
    expect((await del(lucas())).status).toBe(200);
    expect((await at(() => call(phone, "GET", "/api/v1/me"))).status).toBe(401);
    expect((await at(() => call(lucas(), "GET", "/api/v1/me"))).status).toBe(401);
    expect((await at(() => call(mariana(), "GET", "/api/v1/me"))).status).toBe(200);
  });

  it("revoga as conexões de assistente: o token antigo recebe 401 e os tokens somem", async () => {
    const t = await oauthDance({ member: lucas() });
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(200);
    expect((await del(lucas())).status).toBe(200);
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);
    const g = await db.mcpGrant.findFirstOrThrow({ where: { userId: lucas().userId } });
    expect(g.status).toBe("REVOKED");
    expect(await db.mcpToken.count()).toBe(0);
  });

  it("desliga o consentimento de IA que ele deu e ainda valia; o de outro membro fica", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: {} });
    await db.member.update({ where: { id: mid("Lucas") }, data: { role: "ADMIN" } });
    const ev = (memberId: string, purpose: "SPENDING_ANALYSIS" | "INVOICE_IMPORT", ms: number) =>
      db.aiConsentEvent.create({
        data: {
          familyId: fx.family.id,
          purpose,
          action: "ENABLED",
          textVersion: 1,
          memberId,
          createdAt: new Date(Date.parse(NOW) - ms),
        },
      });
    await ev(mid("Lucas"), "SPENDING_ANALYSIS", 5000);
    await ev(mid("Mariana"), "INVOICE_IMPORT", 4000);
    expect((await del(lucas())).status).toBe(200);
    const last = async (purpose: string) =>
      (
        await db.$queryRaw<Array<{ action: string; memberId: string }>>`
          SELECT action::text AS action, "memberId" FROM ai_consent_events
          WHERE purpose = ${purpose}::"LlmPurpose" ORDER BY "createdAt" DESC, id DESC LIMIT 1`
      )[0];
    expect(await last("SPENDING_ANALYSIS")).toMatchObject({
      action: "DISABLED",
      memberId: mid("Lucas"),
    });
    expect(await last("INVOICE_IMPORT")).toMatchObject({
      action: "ENABLED",
      memberId: mid("Mariana"),
    });
  });

  it("novo login com o mesmo Google cria usuário novo, sem família; convite pendente vale para a conta nova", async () => {
    const other = await makeFamily({
      name: "Família Souza",
      members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    });
    await makeInvitation(other, {
      email: "lucas@exemplo.com",
      status: "PENDING",
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    const oldId = lucas().userId;
    expect((await del(lucas())).status).toBe(200);
    const again = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    expect(again.userId).not.toBe(oldId);
    expect((await at(() => call(again, "GET", "/api/v1/accounts"))).body.error.code).toBe(
      "NO_FAMILY",
    );
    const inv = await at(() => call(again, "GET", "/api/v1/me/invitations"));
    expect(inv.status).toBe(200);
    expect(JSON.stringify(inv.body)).toContain("Família Souza");
  });

  it("não toca em outra família", async () => {
    const other = await makeFamily({
      name: "Família Souza",
      members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    });
    const c = await makeAccount(other, {
      name: "Conta da Ana",
      owner: "Ana",
      openingBalanceInCents: 777,
    });
    const snapshot = async () =>
      JSON.stringify(
        [
          await db.member.findMany({ where: { familyId: other.family.id } }),
          await db.transaction.findMany({ where: { familyId: other.family.id } }),
          await db.user.findUnique({ where: { id: other.members[0]?.userId as string } }),
        ],
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      );
    const before = await snapshot();
    expect((await del(lucas())).status).toBe(200);
    expect(await snapshot()).toBe(before);
    expect(c.id).toBeTruthy();
  });

  it("ex-membro sem família também pode excluir a conta", async () => {
    await db.member.update({
      where: { id: mid("Lucas") },
      data: { removedAt: new Date("2026-10-20T10:00:00Z"), removalKind: "REMOVED" },
    });
    const relogin = await asUser("lucas@exemplo.com");
    const r = await del(relogin);
    expect(r.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: relogin.userId } })).name).toBe(
      DELETED_ACCOUNT_NAME,
    );
  });
});

describe("SEC-017c idempotência e concorrência", () => {
  it("mesma chave (ou nenhuma): a 2ª chamada simultânea recebe a mesma resposta; um único MEMBER_LEFT", async () => {
    const key = crypto.randomUUID();
    const rs = await Promise.all([del(lucas(), {}, { key }), del(lucas(), {}, { key })]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(rs.map((r) => r.body)).toEqual([{ deleted: true }, { deleted: true }]);
    expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);
  });

  it("chaves diferentes ao mesmo tempo: uma exclusão só", async () => {
    const rs = await Promise.all([del(lucas()), del(lucas()), del(lucas())]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);
    expect(await db.user.count({ where: { deletedAt: { not: null } } })).toBe(1);
  });

  it("repetir depois de excluída: sessão já não existe (401) e nada muda", async () => {
    expect((await del(lucas())).status).toBe(200);
    expect((await del(lucas())).status).toBe(401);
    expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);
  });

  it("dois membros se excluindo ao mesmo tempo: o último Administrador nunca fica sem Administrador", async () => {
    await db.member.update({ where: { id: mid("Lucas") }, data: { role: "ADMIN" } });
    const rs = await Promise.all([del(lucas()), del(mariana())]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.member.count({ where: { removedAt: null, role: "ADMIN" } })).toBe(1);
  });
});

describe("SEC-017c o trilho append-only continua valendo", () => {
  it("UPDATE direto em family_events (sem o ajuste de anonimização) segue proibido", async () => {
    await db.familyEvent.create({
      data: {
        familyId: fx.family.id,
        type: "FAMILY_RENAMED",
        actorMemberId: mid("Mariana"),
        changes: {},
      },
    });
    await expect(
      db.$executeRaw`UPDATE family_events SET changes = '{"x":1}'::jsonb`,
    ).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM family_events`).rejects.toThrow(/append-only/);
  });
});
