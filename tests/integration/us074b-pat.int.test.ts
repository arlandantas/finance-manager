import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeCard, makeFamily } from "../support/factories";
import {
  mcpCall,
  oauthDance,
  postToken,
  stubCimd,
  toolCall,
  useMcpEnv,
} from "../support/mcp-client";

// US-074b (ADR-043): token pessoal (PAT). Sem LLM, sem rede, sem e-mail real (mailer em memória).
const db = testDb();
const T0 = Date.parse("2026-11-10T15:00:00Z");
const DAY = 86_400_000;
const at = <T>(offsetMs: number, fn: () => Promise<T>) =>
  withClock(new Date(T0 + offsetMs).toISOString(), fn);
const PAT = /^fmp_[A-Za-z0-9_-]{43}$/;
let fx: FamilyFixture;
let card: Awaited<ReturnType<typeof makeCard>>;
let cat: string;
let mailer: InMemoryMailer;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];

const create = (who = lucas(), body: Record<string, unknown> = {}, offset = 0, key?: string) =>
  at(offset, () =>
    call(
      who,
      "POST",
      "/api/v1/assistant/tokens",
      { label: "Meu Cursor", ...body },
      key ? { idempotencyKey: key } : {},
    ),
  );
const lancar = (bearer: string, n = 1, offset = 0) =>
  at(offset, async () => {
    const r = await toolCall(bearer, "lancar_despesa", {
      description: `Item ${n}`,
      amountInCents: 1000 + n,
      categoryId: cat,
      cardId: card.id,
    });
    return { status: r.status, res: r.body?.result, raw: r };
  });
const errCode = (r: { res?: any }) => r.res?.structuredContent?.error?.code;
const ping = (bearer: string, offset = 0) => at(offset, () => mcpCall(bearer, "tools/list", {}));
const tokenOf = async (body: Record<string, unknown> = {}, who = lucas()) =>
  (await create(who, body)).body.token as string;

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  process.env.MCP_PAT_ENABLED = "true";
  stubCimd();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
  await db.family.update({ where: { id: fx.family.id }, data: { assistantPatEnabled: true } });
  card = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas", limitInCents: 1_000_000 });
  cat = (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Saúde" } }))
    .id;
});
afterEach(() => {
  vi.unstubAllGlobals();
  setMailer(null);
  delete process.env.MCP_PAT_ENABLED;
});

describe("AC1/AC8: criação, hash e segredo", () => {
  it("devolve fmp_ uma vez, guarda só o sha256, audita sem o token e não vaza em lugar nenhum", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const r = await create(lucas(), {}, 0, key);
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const token = r.body.token as string;
    expect(token).toMatch(PAT);
    expect(r.body.connection).toMatchObject({
      kind: "PAT",
      clientName: "Token pessoal",
      scopes: ["read"],
    });
    const row = await db.mcpToken.findFirstOrThrow({ where: { kind: "PAT" } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    const grant = await db.mcpGrant.findFirstOrThrow();
    expect(grant).toMatchObject({ kind: "PAT", clientId: null, requireConfirmation: false });
    expect(grant.expiresAt.getTime()).toBe(T0 + 30 * DAY);

    const replay = await create(lucas(), {}, 0, key);
    expect(replay.body.token).toBeUndefined();
    expect(replay.body.tokenRedacted).toBe(true);
    expect(replay.body.connection.id).toBe(r.body.connection.id);
    expect(await db.mcpToken.count({ where: { kind: "PAT" } })).toBe(1);

    const get = await call(lucas(), "GET", "/api/v1/assistant/settings");
    expect(get.body.items[0]).toMatchObject({ kind: "PAT" });
    const audit = await db.mcpAuditEvent.findFirstOrThrow({ where: { kind: "CONNECTED" } });
    expect(audit).toMatchObject({
      clientName: "Token pessoal",
      params: { type: "PAT", validityDays: 30 },
    });
    await ping(token);
    const everything = JSON.stringify([
      await db.mcpAuditEvent.findMany(),
      await db.idempotencyRecord.findMany(),
      get.body,
      mailer.sent,
      await db.mcpGrant.findMany(),
    ]);
    expect(everything).not.toContain(token);
    expect(everything).not.toMatch(/fmp_[A-Za-z0-9_-]{43}/);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("lucas@exemplo.com");
  });
});

describe("AC2/AC3: escopo, validade e confirmação", () => {
  it("só read por padrão; allowWrite sem ciência e validade fora de 7/30/90 = 400", async () => {
    const t = await tokenOf();
    expect(errCode(await lancar(t))).toBe("INSUFFICIENT_SCOPE");
    expect(await db.mcpAuditEvent.count({ where: { outcome: "DENIED_SCOPE" } })).toBe(1);
    expect((await create(lucas(), { allowWrite: true })).status).toBe(400);
    expect((await create(lucas(), { validityDays: 15 })).status).toBe(400);
    expect((await create(lucas(), { label: "  " })).status).toBe(400);
    expect((await create(lucas(), { extra: 1 })).status).toBe(400);
    const ok = await create(lucas(), { validityDays: 7 });
    expect(new Date(ok.body.connection.expiresAt).getTime()).toBe(T0 + 7 * DAY);
  });

  it("com write nasce com confirmação; sem o modo, a 11ª despesa do dia (somando OAuth) é recusada", async () => {
    const t = await tokenOf({ allowWrite: true, writeAcknowledged: true });
    expect(errCode(await lancar(t))).toBe("CONFIRMATION_REQUIRED");
    const args = { description: "Farmácia", amountInCents: 8000, categoryId: cat, cardId: card.id };
    const prop = await at(0, () => toolCall(t, "propor_lancamento", args));
    expect(prop.body.result.structuredContent.status).toBe("PENDING");
    expect(await db.assistantProposal.count()).toBe(1);

    const grant = await db.mcpGrant.findFirstOrThrow({ where: { kind: "PAT" } });
    await db.mcpGrant.update({ where: { id: grant.id }, data: { requireConfirmation: false } });
    await db.memberAssistantLimits.create({
      data: {
        familyId: fx.family.id,
        memberId: fx.byName.Lucas?.memberId as string,
        maxAmountPerTxCents: 50000n,
        maxTxPerDay: 10,
        maxTxPerHour: null,
      },
    });
    const oauth = (
      await at(0, () =>
        oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true }),
      )
    ).accessToken;
    for (let i = 1; i <= 5; i++) expect(errCode(await lancar(oauth, i))).toBeUndefined();
    for (let i = 6; i <= 10; i++) expect(errCode(await lancar(t, i))).toBeUndefined();
    expect(errCode(await lancar(t, 11))).toBe("LIMIT_EXCEEDED");
  });
});

describe("AC4: revogar e vencer", () => {
  it("revogar pela rota das conexões dá 401; vencido dá 401 'credencial expirada'", async () => {
    const a = await create();
    expect((await ping(a.body.token)).status).toBe(200);
    const rev = await at(0, () =>
      call(lucas(), "POST", `/api/v1/assistant/connections/${a.body.connection.id}/revoke`, {}),
    );
    expect(rev.status).toBe(200);
    expect((await ping(a.body.token)).status).toBe(401);

    const b = await create();
    const late = await ping(b.body.token, 31 * DAY);
    expect(late.status).toBe(401);
    expect(late.headers.get("www-authenticate")).toContain("credencial expirada");
  });
});

describe("AC5: chaves desligadas e membro removido", () => {
  it("MCP_PAT_ENABLED desligado: criar = 404 e o token existente = 401", async () => {
    const t = await tokenOf();
    process.env.MCP_PAT_ENABLED = "false";
    expect((await create()).status).toBe(404);
    expect((await ping(t)).status).toBe(401);
    process.env.MCP_ENABLED = "false";
    expect((await create()).status).toBe(404);
  });

  it("assistantPatEnabled=false e assistantAccessEnabled=false: criar = 403 e usar = 401", async () => {
    const t = await tokenOf();
    await db.family.update({ where: { id: fx.family.id }, data: { assistantPatEnabled: false } });
    expect((await create()).status).toBe(403);
    expect((await ping(t)).status).toBe(401);
    await db.family.update({
      where: { id: fx.family.id },
      data: { assistantPatEnabled: true, assistantAccessEnabled: false },
    });
    expect((await create()).status).toBe(403);
    expect((await ping(t)).status).toBe(401);
  });

  it("quem sai da família perde os PAT na hora", async () => {
    const t = await tokenOf();
    const r = await at(0, () => call(lucas(), "POST", "/api/v1/family/leave", {}));
    expect(r.status).toBe(200);
    expect((await ping(t)).status).toBe(401);
    expect((await db.mcpGrant.findFirstOrThrow()).status).toBe("REVOKED");
  });
});

describe("AC6: limites", () => {
  it("o 6º token ativo = 409 PAT_LIMIT_REACHED (revogar libera)", async () => {
    const made = [await create(), await create(), await create(), await create(), await create()];
    const sixth = await create();
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("PAT_LIMIT_REACHED");
    await call(
      lucas(),
      "POST",
      `/api/v1/assistant/connections/${made[0]?.body.connection.id}/revoke`,
      {},
    );
    expect((await create()).status).toBe(201);
  });

  it("a 11ª criação do dia = 429 (por membro)", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await create();
      expect(r.status).toBe(201);
      await call(
        lucas(),
        "POST",
        `/api/v1/assistant/connections/${r.body.connection.id}/revoke`,
        {},
      );
    }
    expect((await create()).status).toBe(429);
    expect((await create(mariana())).status).toBe(201);
  });

  it("a 31ª falha de autenticação no minuto pelo mesmo IP = 429; IP diferente não é afetado", async () => {
    const bad = `fmp_${"A".repeat(43)}`;
    const h = { "x-real-ip": "203.0.113.9" };
    const go = (ip = h) => at(0, () => mcpCall(bad, "tools/list", {}, { headers: ip }));
    for (let i = 0; i < 30; i++) expect((await go()).status).toBe(401);
    expect((await go()).status).toBe(429);
    expect((await go({ "x-real-ip": "203.0.113.10" })).status).toBe(401);
  });
});

describe("AC7: isolamento de uso", () => {
  it("PAT não autentica em /api/v1 nem em /api/oauth/token; tipos cruzados = 401; OAuth segue valendo", async () => {
    const t = await tokenOf();
    const v1 = await call(null, "GET", "/api/v1/assistant/settings", undefined, {
      headers: { authorization: `Bearer ${t}` },
    });
    expect(v1.status).toBe(401);
    const ref = await postToken({ grant_type: "refresh_token", refresh_token: t, client_id: "x" });
    expect(ref.status).toBe(400);

    const oauth = (await at(0, () => oauthDance({ member: lucas() }))).accessToken;
    expect((await ping(oauth)).status).toBe(200);
    const hash = (v: string) => createHash("sha256").update(v).digest("hex");
    await db.mcpToken.update({ where: { tokenHash: hash(t) }, data: { kind: "ACCESS" } });
    await db.mcpToken.update({ where: { tokenHash: hash(oauth) }, data: { kind: "PAT" } });
    expect((await ping(t)).status).toBe(401);
    expect((await ping(oauth)).status).toBe(401);
  });

  it("ADMIN e MEMBER criam; token de outra família segue a chave da SUA família e ninguém revoga o do outro", async () => {
    const m = await tokenOf({}, mariana());
    const l = await tokenOf({}, lucas());
    expect((await ping(m)).status).toBe(200);
    expect((await ping(l)).status).toBe(200);
    const other = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const outra = other.byName.Outra?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
    await db.family.update({ where: { id: other.family.id }, data: { assistantPatEnabled: true } });
    const o = await create(outra);
    expect(o.status).toBe(201);
    await db.family.update({
      where: { id: other.family.id },
      data: { assistantPatEnabled: false },
    });
    expect((await ping(o.body.token)).status).toBe(401);
    expect((await ping(l)).status).toBe(200);
    const id = (
      await db.mcpGrant.findFirstOrThrow({ where: { memberId: fx.byName.Lucas?.memberId } })
    ).id;
    const rev = await call(outra, "POST", `/api/v1/assistant/connections/${id}/revoke`, {});
    expect(rev.status).toBe(404);
    expect((await ping(l)).status).toBe(200);
  });
});
