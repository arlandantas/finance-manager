import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";
import {
  authorizeUrl,
  getAuthorize,
  mcpCall,
  oauthDance,
  pkcePair,
  postDecision,
  stubCimd,
  useMcpEnv,
} from "../support/mcp-client";

// US-074 (SDD-025): conexões do assistente por membro, revogação e bloqueio pela família.
const db = testDb();
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily();
});
afterEach(() => vi.unstubAllGlobals());

describe("lista de conexões", () => {
  it("nasce desligado: membro novo sem conexões; sem credencial no corpo", async () => {
    const r = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      items: [],
      enabled: true,
      familyAllows: true,
      canEditFamilySwitch: false,
      blockedNotice: null,
      mcpUrl: "http://localhost:3100/api/mcp",
    });
    await expect(call(mariana(), "GET", "/api/v1/assistant/settings")).resolves.toMatchObject({
      body: { canEditFamilySwitch: true },
    });
  });

  it("depois do consentimento a conexão aparece (relógio 24/10/2026, 30 dias => 23/11/2026), sem fma_/fmr_", async () => {
    await withClock("2026-10-24T15:00:00Z", async () => {
      await oauthDance({ member: lucas() });
      const r = await call(lucas(), "GET", "/api/v1/assistant/settings");
      expect(r.body.items).toHaveLength(1);
      expect(r.body.items[0]).toMatchObject({
        label: "Meu Claude",
        scopeLabel: "Consulta",
        status: "ACTIVE",
        expiresAt: "2026-11-23T15:00:00.000Z",
        redirectHost: "claude.ai",
        revokedAt: null,
      });
      expect(JSON.stringify(r.body)).not.toMatch(/fma_|fmr_/);
    });
  });

  it("conexão com lançamento mostra 'Consulta e lançamento'", async () => {
    await oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true });
    const r = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(r.body.items[0].scopeLabel).toBe("Consulta e lançamento");
    expect(r.body.items[0].scopes).toEqual(["read", "write"]);
  });

  it("cada membro vê só as suas; Mariana não revoga a de Lucas (404)", async () => {
    await oauthDance({ member: lucas() });
    const m = await call(mariana(), "GET", "/api/v1/assistant/settings");
    expect(m.body.items).toEqual([]);
    const id = (await db.mcpGrant.findFirstOrThrow()).id;
    const r = await call(mariana(), "POST", `/api/v1/assistant/connections/${id}/revoke`, {});
    expect(r.status).toBe(404);
    expect((await db.mcpGrant.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  });

  it("outra família: ADMIN da Souza não lista nem revoga nada da Silva (404)", async () => {
    await oauthDance({ member: lucas() });
    const souza = await makeFamily({
      name: "Família Souza",
      members: [{ email: "paulo@souza.com", name: "Paulo Souza" }],
    });
    const p = souza.byName.Paulo?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
    expect((await call(p, "GET", "/api/v1/assistant/settings")).body.items).toEqual([]);
    const id = (await db.mcpGrant.findFirstOrThrow()).id;
    expect((await call(p, "POST", `/api/v1/assistant/connections/${id}/revoke`, {})).status).toBe(
      404,
    );
  });
});

describe("consentimento", () => {
  it("allow sem privacyAcknowledged => 400", async () => {
    const { challenge } = pkcePair();
    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const requestId = new URL(auth.location).searchParams.get("request");
    const r = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      label: "Meu Claude",
      validityDays: 30,
      allowWrite: false,
    });
    expect(r.status).toBe(400);
    expect(await db.mcpGrant.count()).toBe(0);
  });

  it("allowWrite sem writeAcknowledged => 400", async () => {
    await expect(
      oauthDance({
        member: lucas(),
        scopes: ["read", "write"],
        allowWrite: true,
        decisionOverrides: { writeAcknowledged: undefined },
      }),
    ).rejects.toThrow(/400/);
  });

  it("reconectar o mesmo cliente revoga a anterior (CLIENT)", async () => {
    await oauthDance({ member: lucas() });
    await oauthDance({ member: lucas() });
    const rows = await db.mcpGrant.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((g) => [g.status, g.revokedReason])).toEqual([
      ["REVOKED", "CLIENT"],
      ["ACTIVE", null],
    ]);
  });
});

describe("revogar", () => {
  it("revoga na hora: /api/mcp seguinte 401; selo Revogado e tokens apagados; idempotente", async () => {
    const t = await oauthDance({ member: lucas() });
    expect((await mcpCall(t.accessToken, "tools/list")).status).toBe(200);
    const id = (await db.mcpGrant.findFirstOrThrow()).id;
    const r = await call(lucas(), "POST", `/api/v1/assistant/connections/${id}/revoke`, {});
    expect(r.status).toBe(200);
    expect(r.body.connection).toMatchObject({ status: "REVOKED", revokedReason: "MEMBER" });
    expect((await mcpCall(t.accessToken, "tools/list")).status).toBe(401);
    expect(await db.mcpToken.count({ where: { grantId: id } })).toBe(0);
    const ev = await db.mcpAuditEvent.findMany({ where: { kind: "REVOKED" } });
    expect(ev).toHaveLength(1);
    const again = await call(lucas(), "POST", `/api/v1/assistant/connections/${id}/revoke`, {});
    expect(again.status).toBe(200);
    expect(again.body.connection.status).toBe("REVOKED");
    expect(await db.mcpAuditEvent.count({ where: { kind: "REVOKED" } })).toBe(1);
    const list = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(list.body.items[0].status).toBe("REVOKED");
  });

  it("conexão vencida aparece como EXPIRED na lista", async () => {
    await withClock("2026-10-24T15:00:00Z", () => oauthDance({ member: lucas() }));
    const r = await withClock("2026-12-01T15:00:00Z", () =>
      call(lucas(), "GET", "/api/v1/assistant/settings"),
    );
    expect(r.body.items[0].status).toBe("EXPIRED");
  });
});

describe("bloqueio pela família", () => {
  it("ADMIN desliga: todas REVOKED/FAMILY_BLOCKED, /api/mcp 401, novo consentimento 409, evento da família", async () => {
    const tl = await oauthDance({ member: lucas() });
    const tm = await oauthDance({ member: mariana(), label: "Claude da Mari" });
    const s = await call(mariana(), "GET", "/api/v1/assistant/settings");
    const r = await call(mariana(), "PATCH", "/api/v1/family/assistant-access", {
      enabled: false,
      familyVersion: s.body.familyVersion,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      familyAllows: false,
      blockedNotice: "O Administrador bloqueou o acesso por assistente",
    });
    const rows = await db.mcpGrant.findMany();
    expect(rows.map((g) => [g.status, g.revokedReason])).toEqual([
      ["REVOKED", "FAMILY_BLOCKED"],
      ["REVOKED", "FAMILY_BLOCKED"],
    ]);
    expect((await mcpCall(tl.accessToken, "tools/list")).status).toBe(401);
    expect((await mcpCall(tm.accessToken, "tools/list")).status).toBe(401);
    expect(await db.mcpAuditEvent.count({ where: { kind: "BLOCKED" } })).toBe(2);
    expect(await db.familyEvent.count({ where: { type: "ASSISTANT_ACCESS_CHANGED" } })).toBe(1);

    const lucasView = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(lucasView.body.blockedNotice).toBe("O Administrador bloqueou o acesso por assistente");
    expect(lucasView.body.items[0]).toMatchObject({
      status: "REVOKED",
      revokedReason: "FAMILY_BLOCKED",
    });

    const { challenge } = pkcePair();
    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const requestId = new URL(auth.location).searchParams.get("request");
    const dec = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      label: "Outro",
      validityDays: 30,
      allowWrite: false,
      privacyAcknowledged: true,
    });
    expect(dec.status).toBe(409);
    expect(dec.body.error.code).toBe("ASSISTANT_BLOCKED");
  });

  it("religar só muda a chave: as conexões revogadas não voltam", async () => {
    const t = await oauthDance({ member: lucas() });
    let v = (await call(mariana(), "GET", "/api/v1/assistant/settings")).body.familyVersion;
    await call(mariana(), "PATCH", "/api/v1/family/assistant-access", {
      enabled: false,
      familyVersion: v,
    });
    v = (await call(mariana(), "GET", "/api/v1/assistant/settings")).body.familyVersion;
    const on = await call(mariana(), "PATCH", "/api/v1/family/assistant-access", {
      enabled: true,
      familyVersion: v,
    });
    expect(on.body.familyAllows).toBe(true);
    expect((await mcpCall(t.accessToken, "tools/list")).status).toBe(401);
    expect(
      (await call(lucas(), "GET", "/api/v1/assistant/settings")).body.blockedNotice,
    ).toBeNull();
  });

  it("membro comum não altera (403); versão velha => 409", async () => {
    const s = await call(lucas(), "GET", "/api/v1/assistant/settings");
    const r = await call(lucas(), "PATCH", "/api/v1/family/assistant-access", {
      enabled: false,
      familyVersion: s.body.familyVersion,
    });
    expect(r.status).toBe(403);
    expect(r.body.error.message).toBe("Só o Administrador pode alterar");
    const old = await call(mariana(), "PATCH", "/api/v1/family/assistant-access", {
      enabled: false,
      familyVersion: 99,
    });
    expect(old.status).toBe(409);
    expect(old.body.error.code).toBe("VERSION_CONFLICT");
    expect((await db.family.findFirstOrThrow()).assistantAccessEnabled).toBe(true);
  });
});

describe("MCP desligado no servidor", () => {
  it("settings informa enabled=false", async () => {
    process.env.MCP_ENABLED = "false";
    const r = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(r.body.enabled).toBe(false);
  });
});
