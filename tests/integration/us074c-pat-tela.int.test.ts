import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { logger } from "@/lib/logger";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeCard, makeFamily } from "../support/factories";
import { mcpCall, oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";

// US-074c (ADR-043): chave do Administrador, DTO sem o valor e e-mail de limite do token pessoal.
// Sem LLM, sem rede e sem e-mail real (mailer em memória).
const db = testDb();
const T0 = Date.parse("2026-11-10T15:00:00Z");
const at = <T>(offsetMs: number, fn: () => Promise<T>) =>
  withClock(new Date(T0 + offsetMs).toISOString(), fn);
let fx: FamilyFixture;
let mailer: InMemoryMailer;
type As = NonNullable<FamilyFixture["byName"][string]>["as"];
const lucas = () => fx.byName.Lucas?.as as As;
const mariana = () => fx.byName.Mariana?.as as As;

const create = (who = lucas(), body: Record<string, unknown> = {}) =>
  at(0, () => call(who, "POST", "/api/v1/assistant/tokens", { label: "Meu Cursor", ...body }));
const ping = (bearer: string) => at(0, () => mcpCall(bearer, "tools/list", {}));
const settings = (who = lucas()) => at(0, () => call(who, "GET", "/api/v1/assistant/settings"));
const familyVersion = async () =>
  (await db.family.findUniqueOrThrow({ where: { id: fx.family.id } })).version;
const setPat = async (who: As, patEnabled: boolean, version?: number) =>
  at(0, async () =>
    call(who, "PATCH", "/api/v1/family/assistant-access", {
      patEnabled,
      familyVersion: version ?? (await familyVersion()),
    }),
  );
const alerts = () => mailer.sent.filter((m) => m.subject.includes("limite de uso"));

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  process.env.MCP_PAT_ENABLED = "true";
  stubCimd();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
  await db.family.update({ where: { id: fx.family.id }, data: { assistantPatEnabled: true } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setMailer(null);
  delete process.env.MCP_PAT_ENABLED;
});

describe("AC3/AC5/AC7: DTO e revogação pela tela", () => {
  it("expõe as chaves e a lista nunca traz o valor; revogar dá 401 na próxima chamada", async () => {
    const made = await create(lucas(), { allowWrite: true, writeAcknowledged: true });
    const token = made.body.token as string;
    const s = await settings();
    expect(s.body).toMatchObject({
      patEnabled: { env: true, family: true },
      canCreatePat: true,
      familyAllows: true,
    });
    expect(s.body.items[0]).toMatchObject({
      kind: "PAT",
      scopeLabel: "Consulta e lançamento",
      requireConfirmation: true,
      clientName: "Token pessoal",
    });
    expect(JSON.stringify(s.body)).not.toContain(token);
    expect((await ping(token)).status).toBe(200);
    const rev = await at(0, () =>
      call(lucas(), "POST", `/api/v1/assistant/connections/${made.body.connection.id}/revoke`, {}),
    );
    expect(rev.status).toBe(200);
    expect((await ping(token)).status).toBe(401);
  });

  it("chave do servidor ou da família desligada: canCreatePat=false com o motivo no DTO", async () => {
    process.env.MCP_PAT_ENABLED = "false";
    expect((await settings()).body).toMatchObject({
      patEnabled: { env: false, family: true },
      canCreatePat: false,
    });
    process.env.MCP_PAT_ENABLED = "true";
    await db.family.update({ where: { id: fx.family.id }, data: { assistantPatEnabled: false } });
    expect((await settings()).body).toMatchObject({
      patEnabled: { env: true, family: false },
      canCreatePat: false,
    });
  });
});

describe("AC4: chave patEnabled do Administrador", () => {
  it("desligar revoga os PAT da família (FAMILY_BLOCKED), apaga os tokens e mantém o OAuth", async () => {
    const l = (await create(lucas())).body.token as string;
    const m = (await create(mariana())).body.token as string;
    const oauth = (await at(0, () => oauthDance({ member: lucas() }))).accessToken;
    const r = await setPat(mariana(), false);
    expect(r.status).toBe(200);
    expect(r.body.patEnabled.family).toBe(false);
    expect((await ping(l)).status).toBe(401);
    expect((await ping(m)).status).toBe(401);
    expect((await ping(oauth)).status).toBe(200);
    const pats = await db.mcpGrant.findMany({ where: { kind: "PAT" } });
    expect(pats.map((g) => [g.status, g.revokedReason])).toEqual([
      ["REVOKED", "FAMILY_BLOCKED"],
      ["REVOKED", "FAMILY_BLOCKED"],
    ]);
    expect(await db.mcpToken.count({ where: { kind: "PAT" } })).toBe(0);
    expect(await db.mcpAuditEvent.count({ where: { kind: "BLOCKED" } })).toBe(2);
    const ev = await db.familyEvent.findFirstOrThrow({
      where: { type: "ASSISTANT_ACCESS_CHANGED" },
    });
    expect(ev.changes).toEqual({ patEnabled: { from: true, to: false } });
    expect((await create()).status).toBe(403);
    // religar libera criar de novo (não ressuscita os revogados)
    expect((await setPat(mariana(), true)).status).toBe(200);
    expect((await create()).status).toBe(201);
    expect((await ping(l)).status).toBe(401);
  });

  it("membro comum = 403; versão velha = 409; corpo vazio = 400", async () => {
    const v = await familyVersion();
    expect((await setPat(lucas(), true)).status).toBe(403);
    expect((await setPat(mariana(), false, v + 5)).status).toBe(409);
    const empty = await at(0, () =>
      call(mariana(), "PATCH", "/api/v1/family/assistant-access", { familyVersion: v }),
    );
    expect(empty.status).toBe(400);
    expect(
      (await db.family.findUniqueOrThrow({ where: { id: fx.family.id } })).assistantPatEnabled,
    ).toBe(true);
  });
});

describe("confirmação do PAT", () => {
  const patch = (who: As, id: string, body: Record<string, unknown>) =>
    at(0, () => call(who, "PATCH", `/api/v1/assistant/connections/${id}/confirmation`, body));

  it("PAT: desligar sem riskAcknowledged = 400; com = 200; ligar não exige", async () => {
    const made = await create(lucas(), { allowWrite: true, writeAcknowledged: true });
    const id = made.body.connection.id as string;
    expect((await patch(lucas(), id, { requireConfirmation: false })).status).toBe(400);
    expect((await db.mcpGrant.findUniqueOrThrow({ where: { id } })).requireConfirmation).toBe(true);
    const ok = await patch(lucas(), id, { requireConfirmation: false, riskAcknowledged: true });
    expect(ok.status).toBe(200);
    expect(ok.body.connection.requireConfirmation).toBe(false);
    expect((await patch(lucas(), id, { requireConfirmation: true })).status).toBe(200);
  });

  it("conexão OAuth segue sem exigir a ciência", async () => {
    const o = await at(0, () =>
      oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true }),
    );
    const grant = await db.mcpGrant.findFirstOrThrow({ where: { kind: "OAUTH" } });
    await db.mcpGrant.update({ where: { id: grant.id }, data: { requireConfirmation: true } });
    expect(o.accessToken).toBeTruthy();
    expect((await patch(lucas(), grant.id, { requireConfirmation: false })).status).toBe(200);
  });
});

describe("AC6: e-mail de limite do token pessoal", () => {
  it("a 61ª chamada no minuto dispara 1 e-mail; a 62ª não; sem token, valores nem descrições", async () => {
    const token = (await create()).body.token as string;
    mailer.sent.length = 0;
    for (let i = 0; i < 60; i++) expect((await ping(token)).status).toBe(200);
    expect(alerts()).toHaveLength(0);
    expect((await ping(token)).status).toBe(429);
    expect(alerts()).toHaveLength(1);
    expect((await ping(token)).status).toBe(429);
    expect(alerts()).toHaveLength(1);
    const mail = alerts()[0];
    expect(mail?.to).toBe("lucas@exemplo.com");
    expect(mail?.text).toContain("/configuracoes/assistente");
    const all = JSON.stringify(mail);
    expect(all).not.toContain(token);
    expect(all).not.toMatch(/fmp_/);
  });

  it("limite de escrita (LIMIT_EXCEEDED) também avisa, uma vez por dia", async () => {
    const card = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      limitInCents: 1_000_000,
    });
    const cat = (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id } })).id;
    const token = (await create(lucas(), { allowWrite: true, writeAcknowledged: true })).body
      .token as string;
    await db.mcpGrant.updateMany({ where: { kind: "PAT" }, data: { requireConfirmation: false } });
    await db.memberAssistantLimits.create({
      data: {
        familyId: fx.family.id,
        memberId: fx.byName.Lucas?.memberId as string,
        maxAmountPerTxCents: 50000n,
        maxTxPerDay: 1,
        maxTxPerHour: null,
      },
    });
    mailer.sent.length = 0;
    const lancar = (n: number) =>
      at(0, () =>
        toolCall(token, "lancar_despesa", {
          description: `Segredo ${n}`,
          amountInCents: 1000 + n,
          categoryId: cat,
          cardId: card.id,
        }),
      );
    expect((await lancar(1)).body.result.structuredContent.error).toBeUndefined();
    expect(alerts()).toHaveLength(0);
    expect((await lancar(2)).body.result.structuredContent.error.code).toBe("LIMIT_EXCEEDED");
    expect((await lancar(3)).body.result.structuredContent.error.code).toBe("LIMIT_EXCEEDED");
    expect(alerts()).toHaveLength(1);
    expect(JSON.stringify(alerts())).not.toContain("Segredo");
  });

  it("conexão OAuth que bate o limite não gera esse e-mail", async () => {
    const oauth = (await at(0, () => oauthDance({ member: lucas() }))).accessToken;
    mailer.sent.length = 0;
    for (let i = 0; i < 61; i++) await ping(oauth);
    expect(alerts()).toHaveLength(0);
  });

  it("falha do e-mail não derruba a resposta de limite", async () => {
    const token = (await create()).body.token as string;
    mailer.failWith = new Error("smtp fora SEGREDO-ERRO");
    const spies = (["info", "warn", "error", "debug"] as const).map((l) =>
      vi.spyOn(logger, l).mockImplementation(() => undefined),
    );
    for (let i = 0; i < 60; i++) await ping(token);
    expect((await ping(token)).status).toBe(429);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).toContain("mcp_pat_alert_failed");
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("SEGREDO-ERRO");
    expect(logged).not.toContain("smtp fora");
  });
});
