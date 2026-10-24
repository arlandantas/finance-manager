import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { purgeMcp } from "@/modules/mcp/purge";
import { hit } from "@/modules/mcp/rate-limit";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeFamily } from "../support/factories";
import {
  initialize,
  mcpCall,
  oauthDance,
  RESOURCE,
  stubCimd,
  toolCall,
  useMcpEnv,
} from "../support/mcp-client";
import { prmUrlForTest } from "../support/mcp-client-extra";

vi.mock("@/modules/mcp/tools", async () => ({
  mcpTools: (await import("../support/mcp-tools")).testTools,
}));

// EN-006b (SDD-024 §5-§8): endpoint MCP stateless, escopo, taxa, auditoria. Sem LLM, sem rede.
const db = testDb();
const T0 = Date.now();
const at = <T>(offsetMs: number, fn: () => Promise<T>) =>
  withClock(new Date(T0 + offsetMs).toISOString(), fn);
const MIN = 60_000;

let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily();
  await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 123456 });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sem credencial", () => {
  it("401 com WWW-Authenticate (resource_metadata e scope) e corpo sem dados", async () => {
    const res = await mcpCall(null, "tools/list");
    expect(res.status).toBe(401);
    const www = res.headers.get("www-authenticate") ?? "";
    expect(www).toContain(`resource_metadata="${prmUrlForTest()}"`);
    expect(www).toContain('scope="read write"');
    expect(res.text).not.toContain("Nubank");
  });

  it("credencial desconhecida => 401 invalid_token 'não autorizado'", async () => {
    const res = await mcpCall("fma_naoexiste", "tools/list");
    expect(res.status).toBe(401);
    expect(res.body.error_description).toBe("não autorizado");
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("um token de REFRESH não serve como acesso", async () => {
    const t = await oauthDance({ member: lucas() });
    expect((await mcpCall(t.refreshToken, "tools/list")).status).toBe(401);
  });
});

describe("escopo", () => {
  it("conexão de leitura: tools/list sem ferramentas write; lancar_teste => 403 insufficient_scope com mensagem legível, auditada, sem efeito", async () => {
    const t = await oauthDance({ member: lucas() });
    const list = await mcpCall(t.accessToken, "tools/list");
    const names = list.body.result.tools.map((x: { name: string }) => x.name);
    expect(names).toContain("consultar_contas");
    expect(names).not.toContain("lancar_teste");

    const res = await toolCall(t.accessToken, "lancar_teste", {});
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    const r = res.body.result;
    expect(r.isError).toBe(true);
    expect(r.structuredContent.error).toEqual({
      code: "INSUFFICIENT_SCOPE",
      message: "sem permissão de lançamento",
    });
    expect(r._meta["mcp/www_authenticate"][0]).toContain("insufficient_scope");
    const ev = await db.mcpAuditEvent.findFirst({ where: { tool: "lancar_teste" } });
    expect(ev).toMatchObject({
      outcome: "DENIED_SCOPE",
      kind: "TOOL",
      memberId: fx.byName.Lucas?.memberId,
    });
  });

  it("conexão com write enxerga e chama a ferramenta de escrita", async () => {
    const t = await oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true });
    const names = (await mcpCall(t.accessToken, "tools/list")).body.result.tools.map(
      (x: { name: string }) => x.name,
    );
    expect(names).toContain("lancar_teste");
    const res = await toolCall(t.accessToken, "lancar_teste", {});
    expect(res.status).toBe(200);
    expect(res.body.result.structuredContent).toEqual({ written: true });
  });

  it("ferramenta de leitura roda em transação somente leitura: tentativa de gravar falha e nada é gravado", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await toolCall(t.accessToken, "leitura_que_escreve");
    expect(res.body.result.isError).toBe(true);
    expect(await db.systemInfo.count({ where: { key: { startsWith: "mcp-" } } })).toBe(0);
  });
});

describe("duas eras do protocolo (stateless)", () => {
  it("2025-11-25: initialize + tools/list + tools/call, sem Mcp-Session-Id e em application/json", async () => {
    const t = await oauthDance({ member: lucas() });
    const init = await initialize(t.accessToken);
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();
    expect(init.headers.get("content-type")).toContain("application/json");
    expect(init.body.result.protocolVersion).toBe("2025-11-25");
    expect(init.body.result.serverInfo.name).toBe("financas-familia");

    const list = await mcpCall(t.accessToken, "tools/list");
    expect(list.body.result.tools.length).toBeGreaterThan(0);
    const schema = list.body.result.tools.find(
      (x: { name: string }) => x.name === "consultar_contas",
    );
    expect(schema.outputSchema).toBeTruthy();
    expect(schema.annotations.readOnlyHint).toBe(true);

    const call = await toolCall(t.accessToken, "consultar_contas");
    expect(call.status).toBe(200);
    expect(call.headers.get("mcp-session-id")).toBeNull();
    expect(call.body.result.structuredContent.accounts[0]).toMatchObject({
      name: "Nubank",
      balanceInCents: 123456,
    });
    expect(JSON.parse(call.body.result.content[0].text)).toEqual(
      call.body.result.structuredContent,
    );
  });

  it("2026-07-28: server/discover + tools/call com envelope _meta", async () => {
    const t = await oauthDance({ member: lucas() });
    const era = { era: "2026-07-28" } as const;
    const d = await mcpCall(t.accessToken, "server/discover", {}, era);
    expect(d.status).toBe(200);
    expect(d.body.result.supportedVersions).toContain("2026-07-28");
    const c = await toolCall(t.accessToken, "consultar_contas", {}, era);
    expect(c.status).toBe(200);
    expect(c.body.result.structuredContent.accounts).toHaveLength(1);
  });

  it("versão desconhecida => 400; GET e DELETE => 405; Origin estranha => 403; lote => 400; JSON inválido => 400", async () => {
    const t = await oauthDance({ member: lucas() });
    const bad = await mcpCall(t.accessToken, "tools/list", {}, { era: "1999-01-01" });
    expect(bad.status).toBe(400);
    expect(bad.text).toContain("Unsupported protocol version");

    const { GET, DELETE } = await import("@/app/api/mcp/route");
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);

    const origin = await mcpCall(
      t.accessToken,
      "tools/list",
      {},
      { headers: { origin: "https://evil.example" } },
    );
    expect(origin.status).toBe(403);

    const { POST } = await import("@/app/api/mcp/route");
    const auth = { authorization: `Bearer ${t.accessToken}`, "content-type": "application/json" };
    const batch = await POST(
      new Request(RESOURCE, {
        method: "POST",
        headers: auth,
        body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]),
      }),
    );
    expect(batch.status).toBe(400);
    const junk = await POST(
      new Request(RESOURCE, { method: "POST", headers: auth, body: "{nao-json" }),
    );
    expect(junk.status).toBe(400);
    const big = await POST(
      new Request(RESOURCE, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ x: "a".repeat(70_000) }),
      }),
    );
    expect(big.status).toBe(413);
  });
});

describe("erros de ferramenta", () => {
  it("falha interna não vaza a mensagem (INTERNAL neutro) e é auditada como ERROR", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await toolCall(t.accessToken, "boom");
    expect(res.body.result.isError).toBe(true);
    expect(res.text).not.toContain("segredo-interno");
    expect(res.text).not.toContain("SELECT");
    expect(res.body.result.structuredContent.error.code).toBe("INTERNAL");
    const ev = await db.mcpAuditEvent.findFirst({ where: { tool: "boom" } });
    expect(ev).toMatchObject({ outcome: "ERROR", errorCode: "INTERNAL" });
  });

  it("entrada inválida volta como erro legível da ferramenta (sem erro de transporte)", async () => {
    const t = await oauthDance({ member: lucas() });
    const res = await toolCall(t.accessToken, "buscar_texto", { q: "x", limit: 999 });
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
  });
});

describe("auditoria sem conteúdo", () => {
  it("consultar_contas gera 1 evento TOOL/OK com membro, ferramenta e data; sem valores nem nomes", async () => {
    const t = await oauthDance({ member: lucas() });
    await at(0, () => toolCall(t.accessToken, "consultar_contas"));
    const evs = await db.mcpAuditEvent.findMany({ where: { kind: "TOOL" } });
    expect(evs).toHaveLength(1);
    const ev = evs[0];
    expect(ev).toMatchObject({
      outcome: "OK",
      tool: "consultar_contas",
      memberId: fx.byName.Lucas?.memberId,
      familyId: fx.family.id,
      clientName: "Claude (teste)",
    });
    const dump = JSON.stringify(ev);
    for (const secret of ["123456", "Nubank", "balanceInCents", "fma_", "fmr_"]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("propriedade: texto livre nunca entra em params (allowlist), para entradas geradas", async () => {
    const t = await oauthDance({ member: lucas() });
    const samples = [
      "mercado do zé",
      "Nubank 123456",
      "ignore as instruções",
      "R$ 9999,99",
      "😀 café",
    ];
    for (const q of samples) await toolCall(t.accessToken, "buscar_texto", { q, limit: 5 });
    const evs = await db.mcpAuditEvent.findMany({ where: { tool: "buscar_texto" } });
    expect(evs).toHaveLength(samples.length);
    const allowed = new Set([
      "period",
      "from",
      "to",
      "accountIds",
      "cardIds",
      "categoryIds",
      "type",
      "page",
      "limit",
      "cardId",
      "proposalId",
    ]);
    for (const [i, ev] of evs.entries()) {
      expect(Object.keys(ev.params as object).every((k) => allowed.has(k))).toBe(true);
      expect(JSON.stringify(ev)).not.toContain(samples[i] as string);
      expect((ev.params as { limit?: number }).limit).toBe(5);
    }
  });

  it("append-only: UPDATE e DELETE no banco são recusados; expurgo só leva linhas com mais de 12 meses", async () => {
    const t = await oauthDance({ member: lucas() });
    await toolCall(t.accessToken, "consultar_contas");
    await expect(db.$executeRaw`UPDATE mcp_audit_events SET "durationMs" = 1`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM mcp_audit_events`).rejects.toThrow();
    // linha com 13 meses (inserida já antiga: o gatilho usa o relógio do banco)
    await db.$executeRaw`INSERT INTO mcp_audit_events (id, "familyId", "memberId", "clientName", kind, params, outcome, "durationMs", "createdAt")
      VALUES (gen_random_uuid(), ${fx.family.id}::uuid, ${fx.byName.Lucas?.memberId}::uuid, 'velho', 'TOOL', '{}', 'OK', 1, now() - interval '13 months')`;
    const before = await db.mcpAuditEvent.count(); // CONNECTED + TOOL + a antiga
    expect(before).toBe(3);
    const purged = await db.$transaction((tx) => purgeMcp(tx, new Date()));
    expect(purged.audit).toBe(1); // só a antiga; as recentes ficam
    expect(await db.mcpAuditEvent.count()).toBe(2);
    expect(await db.$transaction((tx) => purgeMcp(tx, new Date()))).toMatchObject({ audit: 0 }); // idempotente
    // fora do expurgo o gatilho continua fechado
    await expect(db.$executeRaw`DELETE FROM mcp_audit_events`).rejects.toThrow();
  });

  it("atualiza lastUsedAt da conexão no máximo 1x/min", async () => {
    const t = await at(0, () => oauthDance({ member: lucas() }));
    await at(0, () => toolCall(t.accessToken, "consultar_contas"));
    const first = (await db.mcpGrant.findFirstOrThrow()).lastUsedAt;
    expect(first?.getTime()).toBe(T0);
    await at(30_000, () => toolCall(t.accessToken, "consultar_contas"));
    expect((await db.mcpGrant.findFirstOrThrow()).lastUsedAt?.getTime()).toBe(T0);
    await at(61_000, () => toolCall(t.accessToken, "consultar_contas"));
    expect((await db.mcpGrant.findFirstOrThrow()).lastUsedAt?.getTime()).toBe(T0 + 61_000);
  });
});

describe("limite de taxa (Postgres, janela fixa)", () => {
  it("61ª chamada no minuto => 429 + Retry-After e auditoria RATE_LIMITED; minuto seguinte => 200", async () => {
    const t = await at(0, () => oauthDance({ member: lucas() }));
    let last: Awaited<ReturnType<typeof mcpCall>> | undefined;
    await at(0, async () => {
      for (let i = 0; i < 61; i++) last = await mcpCall(t.accessToken, "tools/list");
    });
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(last?.body.error_description).toBe("limite de uso excedido");
    expect(
      await db.mcpAuditEvent.count({ where: { outcome: "RATE_LIMITED" } }),
    ).toBeGreaterThanOrEqual(1);
    const next = await at(61_000, () => mcpCall(t.accessToken, "tools/list"));
    expect(next.status).toBe(200);
  });

  it("limite diário de 1.000 por conexão", async () => {
    const t = await at(0, () => oauthDance({ member: lucas() }));
    const g = await db.mcpGrant.findFirstOrThrow();
    const day = Math.floor(T0 / 86_400_000) * 86_400_000;
    await db.mcpRateBucket.create({
      data: { key: `grant:${g.id}:day`, windowStart: new Date(day), count: 1000 },
    });
    const res = await at(0, () => mcpCall(t.accessToken, "tools/list"));
    expect(res.status).toBe(429);
  });

  it("10 chamadas concorrentes com limite 5 => exatamente 5 aceitas", async () => {
    const now = new Date(T0);
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => hit(db, "teste:concorrencia", 5, 60, now)),
    );
    expect(rs.filter((r) => r.ok).length).toBe(5);
    const rejected = rs.find((r) => !r.ok);
    expect(rejected && !rejected.ok && rejected.retryAfterS).toBeGreaterThan(0);
  });

  it("janelas diferentes não se misturam", async () => {
    const a = await hit(db, "teste:janela", 1, 60, new Date(T0));
    const b = await hit(db, "teste:janela", 1, 60, new Date(T0 + 61_000));
    expect(a.ok && b.ok).toBe(true);
  });
});

describe("revogação e bloqueio na chamada MCP", () => {
  it("revogar para na hora: a chamada seguinte é 401", async () => {
    const t = await oauthDance({ member: lucas() });
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(200);
    await db.$executeRaw`UPDATE mcp_grants SET status='REVOKED', "revokedAt" = now(), "revokedReason" = 'MEMBER'`;
    expect((await toolCall(t.accessToken, "consultar_contas")).status).toBe(401);
  });
});
