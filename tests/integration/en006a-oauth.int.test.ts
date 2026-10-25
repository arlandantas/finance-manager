import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { cimdAllowedClientIds } from "@/modules/mcp/config";
import { setAssistantAccess } from "@/modules/mcp/grants";
import { revalidateMcpClients } from "@/modules/mcp/revalidate";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeFamily } from "../support/factories";
import {
  asMetadataGET,
  authorizeUrl,
  CIMD_URL,
  getAuthorize,
  mcpCall,
  ORIGIN,
  oauthDance,
  pkcePair,
  postDecision,
  postRevoke,
  postToken,
  prmGET,
  prmMcpGET,
  REDIRECT_URI,
  RESOURCE,
  refresh,
  stubCimd,
  toolCall,
  useMcpEnv,
} from "../support/mcp-client";

vi.mock("@/modules/mcp/tools", async () => ({
  mcpTools: (await import("../support/mcp-tools")).testTools,
}));

// EN-006a (SDD-024 §4, §8): servidor de autorização OAuth 2.1 próprio. Cliente de teste, sem LLM e sem rede.
const db = testDb();
const T0 = Date.now();
const at = <T>(offsetMs: number, fn: () => Promise<T>) =>
  withClock(new Date(T0 + offsetMs).toISOString(), fn);
const MIN = 60_000;
const DAY = 86_400_000;

let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const grantsOf = (memberName: string) =>
  db.mcpGrant.findMany({
    where: { memberId: fx.byName[memberName]?.memberId as string },
    orderBy: { createdAt: "asc" },
  });

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("metadados (RFC 9728 / RFC 8414)", () => {
  it("PRM nas duas URLs e metadados do AS declaram S256, none, CIMD e iss; sem DCR no POC", async () => {
    for (const get of [prmGET, prmMcpGET]) {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("cache-control")).toContain("max-age=3600");
      const prm = await res.json();
      expect(prm.resource).toBe(RESOURCE);
      expect(prm.authorization_servers).toEqual([ORIGIN]);
      expect(prm.scopes_supported).toEqual(["read", "write", "offline_access"]);
      expect(prm.bearer_methods_supported).toEqual(["header"]);
    }
    const as = await (await asMetadataGET()).json();
    expect(as).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/api/oauth/token`,
      revocation_endpoint: `${ORIGIN}/api/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    expect(as.registration_endpoint).toBeUndefined();
  });

  it("MCP_ENABLED=false ou VERCEL_ENV=preview => 404 nas famílias de rota", async () => {
    for (const off of [
      () => {
        process.env.MCP_ENABLED = "false";
      },
      () => {
        process.env.MCP_ENABLED = "true";
        process.env.VERCEL_ENV = "preview";
      },
    ]) {
      off();
      expect((await prmGET()).status).toBe(404);
      expect((await asMetadataGET()).status).toBe(404);
      expect(
        (await getAuthorize(authorizeUrl({ member: lucas() }, pkcePair().challenge))).status,
      ).toBe(404);
      expect((await postToken({ grant_type: "refresh_token", client_id: "x" })).status).toBe(404);
      expect((await mcpCall("x", "tools/list")).status).toBe(404);
    }
  });
});

describe("fluxo feliz", () => {
  it("conecta: grant com escopo/validade, auditoria CONNECTED, só hash no banco e respostas no-store", async () => {
    const t = await at(0, () => oauthDance({ member: lucas(), validityDays: 30 }));
    expect(t.accessToken).toMatch(/^fma_/);
    expect(t.refreshToken).toMatch(/^fmr_/);
    expect(t.scope).toBe("read");
    expect(t.expiresIn).toBe(3600);
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({
      status: "ACTIVE",
      label: "Meu Claude",
      scopes: ["read"],
      resource: RESOURCE,
      kind: "OAUTH",
      familyId: fx.family.id,
    });
    expect(Math.round(((g?.expiresAt.getTime() ?? 0) - T0) / DAY)).toBe(30);
    const tokens = await db.mcpToken.findMany();
    expect(tokens.map((x) => x.kind).sort()).toEqual(["ACCESS", "CODE", "REFRESH"]);
    for (const tk of tokens) {
      expect(tk.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect([t.accessToken, t.refreshToken, t.code]).not.toContain(tk.tokenHash);
    }
    const audit = await db.mcpAuditEvent.findMany({ where: { kind: "CONNECTED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      memberId: fx.byName.Lucas?.memberId,
      outcome: "OK",
      clientName: "Claude (teste)",
    });
    expect(JSON.stringify(audit[0])).not.toContain("fma_");
    const raw = await postToken({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
      client_id: CIMD_URL,
    });
    expect(raw.headers.get("cache-control")).toBe("no-store");
    expect(raw.body).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  });

  it("escopo write só é concedido se pedido E marcado; sem write no pedido, allowWrite é ignorado", async () => {
    const w = await oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true });
    expect(w.scope).toBe("read write");
    const r = await oauthDance({ member: mariana(), scopes: ["read"], allowWrite: true });
    expect(r.scope).toBe("read");
    const marked = await oauthDance({
      member: lucas(),
      scopes: ["read", "write"],
      allowWrite: false,
      clientId: CIMD_URL,
    });
    expect(marked.scope).toBe("read");
  });

  it("validade de 90 dias e rótulo personalizado", async () => {
    await at(0, () =>
      oauthDance({ member: lucas(), validityDays: 90, label: "Claude do celular" }),
    );
    const [g] = await grantsOf("Lucas");
    expect(g?.label).toBe("Claude do celular");
    expect(Math.round(((g?.expiresAt.getTime() ?? 0) - T0) / DAY)).toBe(90);
  });

  it("reconectar o mesmo cliente revoga a conexão anterior (CLIENT)", async () => {
    const first = await oauthDance({ member: lucas() });
    const second = await oauthDance({ member: lucas() });
    const gs = await grantsOf("Lucas");
    expect(gs.map((g) => [g.status, g.revokedReason])).toEqual([
      ["REVOKED", "CLIENT"],
      ["ACTIVE", null],
    ]);
    expect((await toolCall(first.accessToken, "consultar_contas")).status).toBe(401);
    expect((await toolCall(second.accessToken, "consultar_contas")).status).toBe(200);
  });
});

describe("/oauth/authorize", () => {
  it("toda resposta com redirecionamento traz iss e state (sucesso de negar e erros)", async () => {
    const { challenge } = pkcePair();
    const cases: Array<[Record<string, string | null>, string]> = [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: null }, "invalid_request"],
      [{ resource: "https://outro.exemplo/api/mcp" }, "invalid_target"],
      [{ response_type: "token" }, "unsupported_response_type"],
    ];
    for (const [overrides, error] of cases) {
      const r = await getAuthorize(
        authorizeUrl({ member: lucas(), authorizeOverrides: overrides }, challenge),
      );
      expect(r.status).toBe(302);
      const u = new URL(r.location);
      expect(`${u.origin}${u.pathname}`).toBe(REDIRECT_URI);
      expect(u.searchParams.get("error")).toBe(error);
      expect(u.searchParams.get("iss")).toBe(ORIGIN);
      expect(u.searchParams.get("state")).toBe("st-123");
    }
    // negar no consentimento
    const ok = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const requestId = new URL(ok.location).searchParams.get("request");
    const denied = await postDecision(lucas(), { requestId, decision: "deny" });
    const back = new URL(denied.body.redirectTo);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("iss")).toBe(ORIGIN);
    expect(back.searchParams.get("state")).toBe("st-123");
    expect(await db.mcpGrant.count()).toBe(0);
  });

  it("cliente desconhecido ou redirect não registrado => página de erro, NUNCA redireciona ao redirect_uri", async () => {
    const { challenge } = pkcePair();
    const bad = await getAuthorize(
      authorizeUrl({ member: lucas(), redirectUri: "https://evil.example/cb" }, challenge),
    );
    expect(bad.location).toContain("/oauth/consent?error=bad_redirect");
    expect(bad.location).not.toContain("evil.example");
    const unknown = await getAuthorize(
      authorizeUrl({ member: lucas(), clientId: "https://evil.example/client.json" }, challenge),
    );
    expect(unknown.location).toContain("/oauth/consent?error=unknown_client");
    const dcr = await getAuthorize(
      authorizeUrl({ member: lucas(), clientId: "dcr_naoexiste" }, challenge),
    );
    expect(dcr.location).toContain("error=unknown_client");
    expect(await db.mcpAuthorizationRequest.count()).toBe(0);
  });

  it("SEC-010: loopback não vale para cliente CIMD (redirect_uri só https no host do client_id)", async () => {
    const { challenge } = pkcePair();
    const loop = await getAuthorize(
      authorizeUrl({ member: lucas(), redirectUri: "http://localhost:3118/callback" }, challenge),
    );
    expect(loop.location).toContain("error=bad_redirect");
    // documento que declara loopback é recusado por inteiro
    await db.mcpClient.deleteMany();
    stubCimd({ redirect_uris: [REDIRECT_URI, "http://localhost/callback"] });
    const doc = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    expect(doc.location).toContain("error=unknown_client");
  });

  it("SEC-010: cliente gravado com redirect de outro host é revalidado a cada uso (invalid_client)", async () => {
    stubCimd();
    const { challenge } = pkcePair();
    const first = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    expect(first.location).toContain("/oauth/consent?request=");
    await db.mcpClient.update({
      where: { clientId: CIMD_URL },
      data: { redirectUris: [REDIRECT_URI, "https://evil.example/cb"] },
    });
    const again = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    expect(again.location).toContain("error=unknown_client");
  });

  it("SEC-010: o script de revalidação revoga as conexões de cliente CIMD fora da regra", async () => {
    stubCimd();
    const dance = await oauthDance({ member: lucas() });
    expect(dance.accessToken).toBeTruthy();
    const ok = await db.$transaction((tx) =>
      revalidateMcpClients(tx, cimdAllowedClientIds(process.env), new Date()),
    );
    expect(ok).toEqual({ invalidClients: 0, revokedGrants: 0 });
    await db.mcpClient.update({
      where: { clientId: CIMD_URL },
      data: { redirectUris: ["https://evil.example/cb"] },
    });
    const r = await db.$transaction((tx) =>
      revalidateMcpClients(tx, cimdAllowedClientIds(process.env), new Date()),
    );
    expect(r).toEqual({ invalidClients: 1, revokedGrants: 1 });
    expect(await db.mcpGrant.findFirstOrThrow()).toMatchObject({
      status: "REVOKED",
      revokedReason: "CLIENT",
    });
    // idempotente
    expect(
      await db.$transaction((tx) =>
        revalidateMcpClients(tx, cimdAllowedClientIds(process.env), new Date()),
      ),
    ).toEqual({ invalidClients: 1, revokedGrants: 0 });
  });

  it("SEC-010: URL do client_id fora da lista exata não vira cliente (nem busca)", async () => {
    const other = "https://claude.ai/qualquer/caminho";
    const stub = stubCimd((url) => {
      if (url === other)
        return new Response("{}", { headers: { "content-type": "application/json" } });
      throw new Error("bloqueado");
    });
    const { challenge } = pkcePair();
    const r = await getAuthorize(authorizeUrl({ member: lucas(), clientId: other }, challenge));
    expect(r.location).toContain("error=unknown_client");
    expect(stub.calls).toEqual([]);
  });

  it("CIMD é buscado uma vez e cacheado por 24 h", async () => {
    const stub = stubCimd();
    const { challenge } = pkcePair();
    await at(0, () => getAuthorize(authorizeUrl({ member: lucas() }, challenge)));
    await at(10 * MIN, () => getAuthorize(authorizeUrl({ member: lucas() }, challenge)));
    expect(stub.calls).toEqual([CIMD_URL]);
    await at(25 * 60 * MIN, () => getAuthorize(authorizeUrl({ member: lucas() }, challenge)));
    expect(stub.calls).toEqual([CIMD_URL, CIMD_URL]);
  });

  it("CIMD inválido (client_id divergente, método de autenticação, corpo grande) => cliente desconhecido", async () => {
    const { challenge } = pkcePair();
    for (const doc of [
      { client_id: "https://claude.ai/outro.json" },
      { token_endpoint_auth_method: "private_key_jwt" },
      { redirect_uris: ["http://evil.example/cb"] },
    ]) {
      await db.mcpClient.deleteMany();
      stubCimd(doc);
      const r = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
      expect(r.location).toContain("error=unknown_client");
    }
  });

  it("SEC-005: um IP que estoura o limite do /authorize não bloqueia outro IP com o mesmo client_id", async () => {
    const { challenge } = pkcePair();
    const atk = { "x-real-ip": "203.0.113.9" };
    const ok = { "x-real-ip": "198.51.100.7" };
    await at(0, async () => {
      for (let i = 0; i < 25; i++) {
        await getAuthorize(authorizeUrl({ member: lucas() }, challenge), atk);
      }
      const blocked = await getAuthorize(authorizeUrl({ member: lucas() }, challenge), atk);
      expect(blocked.location).toContain("error=rate_limited");
      const legit = await getAuthorize(authorizeUrl({ member: lucas() }, challenge), ok);
      expect(legit.location).toContain("/oauth/consent?request=");
    });
  });

  it("limite de pedidos por cliente: o 21º no minuto vira página de erro", async () => {
    const { challenge } = pkcePair();
    let last = "";
    await at(0, async () => {
      for (let i = 0; i < 21; i++) {
        last = (await getAuthorize(authorizeUrl({ member: lucas() }, challenge))).location;
      }
    });
    expect(last).toContain("error=rate_limited");
  });
});

describe("consentimento (decisão)", () => {
  async function pending() {
    const r = await getAuthorize(
      authorizeUrl({ member: lucas(), scopes: ["read", "write"] }, pkcePair().challenge),
    );
    return new URL(r.location).searchParams.get("request") as string;
  }

  it("exige o aviso de privacidade e, com escrita, o aviso de lançamento (400)", async () => {
    const requestId = await pending();
    const a = await postDecision(lucas(), { requestId, decision: "allow" });
    expect(a.status).toBe(400);
    const b = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
      allowWrite: true,
    });
    expect(b.status).toBe(400);
    expect(b.body.error.message).toMatch(/aviso de lançamento/);
    expect(await db.mcpGrant.count()).toBe(0);
  });

  it("pedido de uso único, expira em 10 min e não vale para outro usuário", async () => {
    const requestId = await pending();
    const ok = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(ok.status).toBe(200);
    const again = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("REQUEST_EXPIRED");

    const second = await pending();
    const late = await at(11 * MIN, () =>
      postDecision(lucas(), { requestId: second, decision: "allow", privacyAcknowledged: true }),
    );
    expect(late.status).toBe(409);

    const third = await pending();
    await db.mcpAuthorizationRequest.update({
      where: { id: third },
      data: { userId: lucas().userId },
    });
    const other = await postDecision(mariana(), {
      requestId: third,
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(other.status).toBe(409);
  });

  it("sem sessão => 401; usuário sem família => 403", async () => {
    const requestId = await pending();
    const res = await postDecision({ cookie: "" } as never, { requestId, decision: "deny" });
    expect(res.status).toBe(401);
    const { asUser, uniqueEmail } = await import("../support/factories");
    const solo = await asUser(uniqueEmail("solo"));
    expect((await postDecision(solo, { requestId, decision: "deny" })).status).toBe(403);
  });

  it("origem diferente é recusada (CSRF)", async () => {
    const requestId = await pending();
    const { decisionPOST } = await import("../support/mcp-client-extra");
    const res = await decisionPOST(
      lucas(),
      { requestId, decision: "deny" },
      "https://evil.example",
    );
    expect(res.status).toBe(403);
  });
});

describe("/token: PKCE, replay e expiração", () => {
  it("verificador errado => invalid_grant; sem conexão ativa nada é emitido", async () => {
    await expect(oauthDance({ member: lucas(), verifierOverride: "A".repeat(43) })).rejects.toThrow(
      /invalid_grant/,
    );
    expect(await db.mcpToken.count({ where: { kind: "ACCESS" } })).toBe(0);
  });

  it("SEC-023: verificador errado NÃO queima o código; a troca correta depois ainda funciona", async () => {
    const { verifier, challenge } = pkcePair();
    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const requestId = new URL(auth.location).searchParams.get("request");
    const dec = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    const code = new URL(dec.body.redirectTo).searchParams.get("code") as string;
    const exchange = (v: string) =>
      postToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CIMD_URL,
        code_verifier: v,
      });
    const bad = await exchange("A".repeat(43));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_grant");
    const good = await exchange(verifier);
    expect(good.status).toBe(200);
    expect((await grantsOf("Lucas"))[0]?.status).toBe("ACTIVE");
  });

  it("código usado duas vezes => 2ª invalid_grant e a conexão é revogada (CODE_REUSE); o acesso da 1ª deixa de valer", async () => {
    const { verifier, challenge } = pkcePair();
    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const requestId = new URL(auth.location).searchParams.get("request");
    const dec = await postDecision(lucas(), {
      requestId,
      decision: "allow",
      privacyAcknowledged: true,
    });
    const code = new URL(dec.body.redirectTo).searchParams.get("code") as string;
    const exchange = () =>
      postToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CIMD_URL,
        code_verifier: verifier,
        resource: RESOURCE,
      });
    const first = await exchange();
    expect(first.status).toBe(200);
    expect((await toolCall(first.body.access_token, "consultar_contas")).status).toBe(200);
    const second = await exchange();
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("invalid_grant");
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({ status: "REVOKED", revokedReason: "CODE_REUSE" });
    expect((await toolCall(first.body.access_token, "consultar_contas")).status).toBe(401);
    expect(
      (await refresh({ refreshToken: first.body.refresh_token, clientId: CIMD_URL })).body.error,
    ).toBe("invalid_grant");
  });

  it("trocas simultâneas do mesmo código: no máximo uma vence", async () => {
    const { verifier, challenge } = pkcePair();
    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
    const dec = await postDecision(lucas(), {
      requestId: new URL(auth.location).searchParams.get("request"),
      decision: "allow",
      privacyAcknowledged: true,
    });
    const code = new URL(dec.body.redirectTo).searchParams.get("code") as string;
    const rs = await Promise.all(
      [1, 2, 3].map(() =>
        postToken({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CIMD_URL,
          code_verifier: verifier,
        }),
      ),
    );
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  it("código após 61 s => invalid_grant", async () => {
    const { verifier, challenge } = pkcePair();
    const auth = await at(0, () => getAuthorize(authorizeUrl({ member: lucas() }, challenge)));
    const dec = await at(0, () =>
      postDecision(lucas(), {
        requestId: new URL(auth.location).searchParams.get("request"),
        decision: "allow",
        privacyAcknowledged: true,
      }),
    );
    const code = new URL(dec.body.redirectTo).searchParams.get("code") as string;
    const res = await at(61_000, () =>
      postToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CIMD_URL,
        code_verifier: verifier,
      }),
    );
    expect(res.body.error).toBe("invalid_grant");
  });

  it("client_id, redirect_uri e resource diferentes dos do pedido são recusados", async () => {
    const { verifier, challenge } = pkcePair();
    const mk = async () => {
      const a = await getAuthorize(authorizeUrl({ member: lucas() }, challenge));
      const d = await postDecision(lucas(), {
        requestId: new URL(a.location).searchParams.get("request"),
        decision: "allow",
        privacyAcknowledged: true,
      });
      return new URL(d.body.redirectTo).searchParams.get("code") as string;
    };
    const base = {
      grant_type: "authorization_code",
      client_id: CIMD_URL,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    };
    expect(
      (await postToken({ ...base, code: await mk(), redirect_uri: "http://localhost/callback" }))
        .body.error,
    ).toBe("invalid_grant");
    expect(
      (await postToken({ ...base, code: await mk(), client_id: "https://claude.ai/outro.json" }))
        .body.error,
    ).toBe("invalid_grant");
    expect(
      (await postToken({ ...base, code: await mk(), resource: "https://outro.exemplo/mcp" })).body
        .error,
    ).toBe("invalid_target");
  });

  it("corpo JSON, grant_type desconhecido e client_id ausente", async () => {
    const { tokenPOST } = await import("../support/mcp-client-extra");
    const json = await tokenPOST(
      JSON.stringify({ grant_type: "refresh_token" }),
      "application/json",
    );
    expect(json.status).toBe(400);
    expect((await json.json()).error).toBe("invalid_request");
    expect((await postToken({ grant_type: "password", client_id: CIMD_URL })).body.error).toBe(
      "unsupported_grant_type",
    );
    expect((await postToken({ grant_type: "refresh_token" })).body.error).toBe("invalid_request");
  });

  it("limite de /token por cliente: 31ª chamada no minuto => 429 slow_down; minuto seguinte volta", async () => {
    let last: Awaited<ReturnType<typeof postToken>> | undefined;
    await at(0, async () => {
      for (let i = 0; i < 31; i++)
        last = await postToken({
          grant_type: "refresh_token",
          client_id: CIMD_URL,
          refresh_token: "x",
        });
    });
    expect(last?.status).toBe(429);
    expect(last?.body.error).toBe("slow_down");
    expect(last?.headers.get("retry-after")).toBeTruthy();
    const next = await at(61_000, () =>
      postToken({ grant_type: "refresh_token", client_id: CIMD_URL, refresh_token: "x" }),
    );
    expect(next.status).toBe(400);
  });
});

describe("SEC-005 limite do /token não depende só do client_id público", () => {
  it("IP anônimo que estoura 30/min não impede outro IP de renovar com o mesmo client_id", async () => {
    const t = await at(0, () => oauthDance({ member: lucas() }));
    await at(0, async () => {
      for (let i = 0; i < 40; i++)
        await postToken(
          { grant_type: "refresh_token", client_id: CIMD_URL, refresh_token: `lixo${i}` },
          { "x-real-ip": "203.0.113.9" },
        );
      const blocked = await postToken(
        { grant_type: "refresh_token", client_id: CIMD_URL, refresh_token: "lixo" },
        { "x-real-ip": "203.0.113.9" },
      );
      expect(blocked.status).toBe(429);
      const legit = await postToken(
        { grant_type: "refresh_token", client_id: CIMD_URL, refresh_token: t.refreshToken },
        { "x-real-ip": "198.51.100.7" },
      );
      expect(legit.status).toBe(200);
    });
  });

  it("o mesmo refresh token inválido repetido (mesmo vindo de IPs distintos) é freado: 10/min", async () => {
    let last: Awaited<ReturnType<typeof postToken>> | undefined;
    await at(0, async () => {
      for (let i = 0; i < 11; i++)
        last = await postToken(
          { grant_type: "refresh_token", client_id: CIMD_URL, refresh_token: "mesmo-token" },
          { "x-real-ip": `192.0.2.${i + 1}` },
        );
    });
    expect(last?.status).toBe(429);
  });
});

describe("refresh rotativo", () => {
  it("R1 => (A2, R2); reapresentar R1 => invalid_grant e A2/R2 inválidos (REFRESH_REUSE)", async () => {
    const t = await oauthDance({ member: lucas() });
    const r1 = await refresh(t);
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(t.refreshToken);
    expect((await toolCall(r1.body.access_token, "consultar_contas")).status).toBe(200);
    const replay = await refresh(t);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({ status: "REVOKED", revokedReason: "REFRESH_REUSE" });
    expect((await toolCall(r1.body.access_token, "consultar_contas")).status).toBe(401);
    expect((await refresh(t, r1.body.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("duas trocas simultâneas de R1: uma vence no máximo; a conexão não fica com dois pares válidos", async () => {
    const t = await oauthDance({ member: lucas() });
    const rs = await Promise.all([refresh(t), refresh(t)]);
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    const [g] = await grantsOf("Lucas");
    expect(g?.status).toBe("REVOKED");
  });

  it("escopo no refresh só reduz: ampliar => invalid_scope", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await postToken({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
      client_id: CIMD_URL,
      scope: "read write",
    });
    expect(res.body.error).toBe("invalid_scope");
  });

  it("refresh de outro cliente não vale", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await postToken({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
      client_id: "https://claude.ai/outro.json",
    });
    expect(res.body.error).toBe("invalid_grant");
  });
});

describe("expiração (relógio injetado)", () => {
  it("acesso vence em 60 min (credencial expirada); refresh renova; conexão vence aos 30 dias", async () => {
    const t = await at(0, () => oauthDance({ member: lucas(), validityDays: 30 }));
    expect((await at(59 * MIN, () => toolCall(t.accessToken, "consultar_contas"))).status).toBe(
      200,
    );
    const expired = await at(61 * MIN, () => toolCall(t.accessToken, "consultar_contas"));
    expect(expired.status).toBe(401);
    expect(expired.body.error_description).toBe("credencial expirada");
    expect(expired.headers.get("www-authenticate")).toContain('error="invalid_token"');

    const renewed = await at(61 * MIN, () => refresh(t));
    expect(renewed.status).toBe(200);
    expect(
      (await at(62 * MIN, () => toolCall(renewed.body.access_token, "consultar_contas"))).status,
    ).toBe(200);

    // 31 dias: acesso e refresh deixam de valer, a conexão vira EXPIRED
    const late = await at(31 * DAY, () => toolCall(renewed.body.access_token, "consultar_contas"));
    expect(late.status).toBe(401);
    expect(late.body.error_description).toBe("credencial expirada");
    const lateRefresh = await at(31 * DAY, () => refresh(t, renewed.body.refresh_token));
    expect(lateRefresh.body.error).toBe("invalid_grant");
    const [g] = await grantsOf("Lucas");
    expect(g?.status).toBe("EXPIRED");
  });

  it("expires_in nunca passa do que resta da conexão", async () => {
    const t = await at(0, () => oauthDance({ member: lucas(), validityDays: 30 }));
    const res = await at(30 * DAY - 10 * MIN, () => refresh(t));
    expect(res.status).toBe(200);
    expect(res.body.expires_in).toBe(600);
  });
});

describe("revogação", () => {
  it("/revoke com refresh revoga a conexão inteira (CLIENT) e responde 200 sempre", async () => {
    const t = await oauthDance({ member: lucas() });
    expect((await postRevoke({ token: "qualquer", client_id: CIMD_URL })).status).toBe(200);
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(200);
    // cliente errado não revoga
    await postRevoke({ token: t.refreshToken, client_id: "https://claude.ai/outro.json" });
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(200);
    expect((await postRevoke({ token: t.refreshToken, client_id: CIMD_URL })).status).toBe(200);
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);
    expect((await refresh(t)).body.error).toBe("invalid_grant");
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({ status: "REVOKED", revokedReason: "CLIENT" });
    expect(await db.mcpAuditEvent.count({ where: { kind: "REVOKED", grantId: g?.id } })).toBe(1);
  });

  it("revogar pelo app (serviço) vale na chamada seguinte", async () => {
    const t = await oauthDance({ member: lucas() });
    const [g] = await grantsOf("Lucas");
    const { revokeGrant } = await import("@/modules/mcp/grants");
    await db.$transaction((tx) =>
      revokeGrant(tx, g?.id as string, "MEMBER", new Date(), fx.byName.Lucas?.memberId),
    );
    const res = await toolCall(t.accessToken, "consultar_contas");
    expect(res.status).toBe(401);
    expect(res.body.error_description).toBe("não autorizado");
  });
});

describe("audiência", () => {
  it("conexão forjada com resource antigo => 401", async () => {
    const t = await oauthDance({ member: lucas() });
    await db.mcpGrant.updateMany({ data: { resource: "https://antigo.exemplo/api/mcp" } });
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);
  });
});

describe("bloqueio da família e saída/remoção de membro", () => {
  it("ADMIN bloqueia: conexões REVOKED/FAMILY_BLOCKED, chamada 401, novo consentimento 409; desbloquear libera", async () => {
    const t = await oauthDance({ member: lucas() });
    await db.$transaction((tx) =>
      setAssistantAccess(
        tx,
        fx.family.id,
        false,
        fx.byName.Mariana?.memberId as string,
        new Date(),
      ),
    );
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({ status: "REVOKED", revokedReason: "FAMILY_BLOCKED" });
    expect(await db.mcpAuditEvent.count({ where: { kind: "BLOCKED" } })).toBe(1);

    const auth = await getAuthorize(authorizeUrl({ member: lucas() }, pkcePair().challenge));
    const dec = await postDecision(lucas(), {
      requestId: new URL(auth.location).searchParams.get("request"),
      decision: "allow",
      privacyAcknowledged: true,
    });
    expect(dec.status).toBe(409);
    expect(dec.body.error.code).toBe("ASSISTANT_BLOCKED");
    // negar continua possível
    expect(
      (
        await postDecision(lucas(), {
          requestId: new URL(auth.location).searchParams.get("request"),
          decision: "deny",
        })
      ).status,
    ).toBe(200);

    await db.$transaction((tx) =>
      setAssistantAccess(tx, fx.family.id, true, fx.byName.Mariana?.memberId as string, new Date()),
    );
    const again = await oauthDance({ member: lucas() });
    expect((await toolCall(again.accessToken, "consultar_contas")).status).toBe(200);
  });

  it("remover Lucas (US-035) revoga as conexões na mesma transação; conexão forjada de ex-membro => 401", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await call(
      mariana(),
      "POST",
      `/api/v1/members/${fx.byName.Lucas?.memberId}/remove`,
      {},
    );
    expect(res.status).toBe(200);
    const [g] = await grantsOf("Lucas");
    expect(g).toMatchObject({ status: "REVOKED", revokedReason: "MEMBER_REMOVED" });
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);

    // forja: reativa a conexão no banco; o vínculo ativo não existe mais
    await db.$executeRaw`UPDATE mcp_grants SET status = 'ACTIVE', "revokedAt" = NULL, "revokedReason" = NULL`;
    const forged = await toolCall(t.accessToken, "consultar_contas");
    expect(forged.status).toBe(401);
  });

  it("Lucas sai e entra em OUTRA família: a conexão antiga não enxerga a nova", async () => {
    const t = await oauthDance({ member: lucas() });
    const other = await makeFamily({
      name: "Família Souza",
      members: [{ email: "souza@exemplo.com", name: "Souza", role: "ADMIN" }],
    });
    await makeAccount(other, { name: "Conta da Souza", openingBalanceInCents: 100 });
    // desvincula e vincula na outra família (sem passar pela API)
    await db.member.update({
      where: { id: fx.byName.Lucas?.memberId },
      data: { removedAt: new Date(), removalKind: "LEFT" },
    });
    await db.member.create({
      data: { familyId: other.family.id, userId: lucas().userId, role: "MEMBER" },
    });
    const res = await toolCall(t.accessToken, "consultar_contas");
    expect(res.status).toBe(401);
    expect(res.text).not.toContain("Conta da Souza");
  });
});

describe("isolamento entre famílias", () => {
  it("o token de uma família nunca devolve dado da outra (varredura de strings e ids)", async () => {
    await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 111111 });
    const souza = await makeFamily({
      name: "Família Souza",
      members: [{ email: "carla@exemplo.com", name: "Carla Souza", role: "ADMIN" }],
    });
    const nubSouza = await makeAccount(souza, { name: "Nubank", openingBalanceInCents: 222222 });
    await makeAccount(souza, { name: "Segredo Souza", openingBalanceInCents: 333333 });

    const silva = await oauthDance({ member: lucas() });
    const sz = await oauthDance({ member: souza.byName.Carla?.as as never });

    const a = await toolCall(silva.accessToken, "consultar_contas");
    expect(a.status).toBe(200);
    expect(a.text).toContain("Nubank");
    expect(a.text).not.toContain("Segredo Souza");
    expect(a.text).not.toContain(nubSouza.id);
    expect(a.text).not.toContain("222222");

    const b = await toolCall(sz.accessToken, "consultar_contas");
    expect(b.text).toContain("Segredo Souza");
    expect(b.text).not.toContain("111111");

    // token da Souza com o id de uma conta da Silva => NOT_FOUND, nunca dado
    const silvaAcc = await db.bankAccount.findFirst({ where: { familyId: fx.family.id } });
    const cross = await toolCall(sz.accessToken, "consultar_contas", { accountId: silvaAcc?.id });
    expect(cross.body.result.isError).toBe(true);
    expect(cross.body.result.structuredContent.error.code).toBe("NOT_FOUND");
    expect(cross.text).not.toContain("111111");
  });
});
