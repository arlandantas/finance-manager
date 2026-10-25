import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { loadConsentView } from "@/modules/mcp/authorize";
import { clearConsentCookie, setConsentCookie } from "@/modules/mcp/consent-binding";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";
import {
  authorizeUrl,
  consentCookieOf,
  getAuthorize,
  oauthDance,
  pkcePair,
  postDecision,
  stubCimd,
  useMcpEnv,
} from "../support/mcp-client";

// SEC-011 (SDD-028 §4): consentimento amarrado ao navegador, cliente verificado e aviso de conexão nova.
const db = testDb();
let fx: FamilyFixture;
let mailer: InMemoryMailer;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setMailer(null);
});

async function startRequest() {
  const r = await getAuthorize(authorizeUrl({ member: lucas() }, pkcePair().challenge));
  const requestId = new URL(r.location).searchParams.get("request") as string;
  return { requestId, setCookie: r.setCookie };
}
const view = (requestId: string, userId: string, cookie: string | null) =>
  loadConsentView(db, requestId, userId, getClock().now(), cookie);

describe("SEC-011 consentimento amarrado ao navegador", () => {
  it("/authorize define o cookie com HttpOnly, SameSite=Lax e Max-Age=600 e guarda só o hash do nonce", async () => {
    const { requestId, setCookie } = await startRequest();
    expect(setCookie).toMatch(/^mcp_authz=[0-9a-f-]{36}\.[A-Za-z0-9_-]{40,}; /);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=600");
    expect(setCookie).toContain("Path=/");
    const row = await db.mcpAuthorizationRequest.findUniqueOrThrow({ where: { id: requestId } });
    const nonce = (consentCookieOf(requestId) as string).split(".")[1] as string;
    expect(row.browserNonceHash).toBe(createHash("sha256").update(nonce).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(nonce);
  });

  it("em produção (https) o cookie leva o prefixo __Host- e Secure; a limpeza também", () => {
    const c = setConsentCookie("rid", "nonce", true);
    expect(c).toMatch(
      /^__Host-mcp_authz=rid\.nonce; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/,
    );
    expect(clearConsentCookie(true)).toContain("__Host-mcp_authz=;");
    expect(clearConsentCookie(true)).toContain("Max-Age=0");
  });

  it("cookie certo => fluxo normal e o usuário fica vinculado ao pedido", async () => {
    const { requestId } = await startRequest();
    const v = await view(requestId, fx.byName.Lucas?.userId as string, consentCookieOf(requestId));
    expect(v).toMatchObject({ state: "OK", requestId });
    const row = await db.mcpAuthorizationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.userId).toBe(fx.byName.Lucas?.userId);
  });

  it("reprodução do relatório: URL repassada a outro navegador => OTHER_BROWSER e o pedido NÃO é vinculado", async () => {
    const { requestId } = await startRequest();
    const victim = fx.byName.Mariana?.userId as string;
    expect(await view(requestId, victim, null)).toEqual({ state: "OTHER_BROWSER" });
    // cookie com nonce errado
    expect(
      await view(requestId, victim, `${requestId}.${randomBytes(32).toString("base64url")}`),
    ).toEqual({
      state: "OTHER_BROWSER",
    });
    // cookie de outro pedido
    expect(
      await view(requestId, victim, `${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}.x`),
    ).toEqual({ state: "OTHER_BROWSER" });
    expect(
      (await db.mcpAuthorizationRequest.findUniqueOrThrow({ where: { id: requestId } })).userId,
    ).toBeNull();
  });

  it("POST de decisão sem cookie é recusado e nenhum código é emitido", async () => {
    const { requestId } = await startRequest();
    const res = await postDecision(
      mariana(),
      { requestId, decision: "allow", privacyAcknowledged: true },
      { consentCookie: null },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OTHER_BROWSER");
    expect(await db.mcpGrant.count()).toBe(0);
    expect(await db.mcpToken.count()).toBe(0);
    // deny sem cookie também é recusado (o pedido continua utilizável pelo dono)
    const deny = await postDecision(
      mariana(),
      { requestId, decision: "deny" },
      { consentCookie: null },
    );
    expect(deny.status).toBe(409);
    expect(
      (await db.mcpAuthorizationRequest.findUniqueOrThrow({ where: { id: requestId } })).consumedAt,
    ).toBeNull();
  });

  it("pedido antigo sem browserNonceHash => OTHER_BROWSER (falha fechada)", async () => {
    const { requestId } = await startRequest();
    await db.mcpAuthorizationRequest.update({
      where: { id: requestId },
      data: { browserNonceHash: null },
    });
    const v = await view(requestId, fx.byName.Lucas?.userId as string, consentCookieOf(requestId));
    expect(v).toEqual({ state: "OTHER_BROWSER" });
    const res = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(res.status).toBe(409);
  });

  it("allow e deny apagam o cookie do navegador", async () => {
    const a = await startRequest();
    const deny = await postDecision(lucas(), { requestId: a.requestId, decision: "deny" });
    expect(deny.status).toBe(200);
    expect(deny.setCookie).toContain("mcp_authz=;");
    expect(deny.setCookie).toContain("Max-Age=0");
    const b = await startRequest();
    const allow = await postDecision(lucas(), {
      requestId: b.requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(allow.status).toBe(200);
    expect(allow.setCookie).toContain("Max-Age=0");
  });
});

describe("SEC-011 cliente verificado", () => {
  it("o nome vem do servidor, mesmo que o documento diga 'Banco Oficial'", async () => {
    stubCimd({ client_name: "Banco Oficial" });
    const { requestId } = await startRequest();
    const v = await view(requestId, fx.byName.Lucas?.userId as string, consentCookieOf(requestId));
    expect(v).toMatchObject({
      state: "OK",
      suggestedLabel: "Claude",
      client: {
        verified: true,
        displayName: "Claude",
        domain: "claude.ai",
        redirectUrl: "https://claude.ai/api/mcp/auth_callback",
      },
    });
  });

  it("cliente fora da lista (DCR) => não verificado e 'Permitir' exige o aviso de risco", async () => {
    const client = await db.mcpClient.create({
      data: {
        clientId: `dcr_${randomBytes(6).toString("hex")}`,
        kind: "DCR",
        clientName: "Banco Oficial",
        redirectUris: ["https://evil.example/cb"],
      },
    });
    const nonce = randomBytes(16).toString("base64url");
    const req = await db.mcpAuthorizationRequest.create({
      data: {
        clientId: client.id,
        redirectUri: "https://evil.example/cb",
        codeChallenge: pkcePair().challenge,
        scopesRequested: ["read"],
        resource: "http://localhost:3100/api/mcp",
        expiresAt: new Date(Date.now() + 600_000),
        browserNonceHash: createHash("sha256").update(nonce).digest("hex"),
      },
    });
    const cookie = `${req.id}.${nonce}`;
    const v = await view(req.id, fx.byName.Lucas?.userId as string, cookie);
    expect(v).toMatchObject({
      state: "OK",
      client: { verified: false, reportedName: "Banco Oficial" },
    });
    const body = { requestId: req.id, decision: "allow", privacyAcknowledged: true };
    const no = await postDecision(lucas(), body, { consentCookie: cookie });
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe("RISK_NOT_ACKNOWLEDGED");
    const yes = await postDecision(
      lucas(),
      { ...body, unverifiedAcknowledged: true },
      { consentCookie: cookie },
    );
    expect(yes.status).toBe(200);
  });
});

describe("SEC-011 aviso de conexão nova (U4)", () => {
  it("conectar gera cartão na Home até dispensar e e-mail ao membro (sem dados financeiros)", async () => {
    await oauthDance({ member: lucas(), label: "Meu Claude" });
    const notices = await call(lucas(), "GET", "/api/v1/assistant/new-connections");
    expect(notices.status).toBe(200);
    expect(notices.body.items).toHaveLength(1);
    expect(notices.body.items[0].label).toBe("Meu Claude");
    // só o próprio membro vê
    expect((await call(mariana(), "GET", "/api/v1/assistant/new-connections")).body.items).toEqual(
      [],
    );
    // e-mail
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("lucas@exemplo.com");
    expect(mailer.sent[0]?.subject).toBe("Nova conexão de assistente na sua conta");
    expect(mailer.sent[0]?.text).toContain("Meu Claude");
    expect(mailer.sent[0]?.text).toContain("/configuracoes/assistente");
    expect(mailer.sent[0]?.text).not.toMatch(/R\$|saldo|extrato/i);
    // outro membro não dispensa
    const id = notices.body.items[0].id as string;
    await call(mariana(), "POST", `/api/v1/assistant/new-connections/${id}/dismiss`, {});
    expect(
      (await call(lucas(), "GET", "/api/v1/assistant/new-connections")).body.items,
    ).toHaveLength(1);
    const d = await call(lucas(), "POST", `/api/v1/assistant/new-connections/${id}/dismiss`, {});
    expect(d.body.items).toEqual([]);
  });

  it("falha no e-mail não derruba a conexão", async () => {
    mailer.failWith = new Error("SMTP fora do ar");
    const t = await oauthDance({ member: lucas() });
    expect(t.accessToken).toBeTruthy();
    expect(await db.mcpGrant.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
});
