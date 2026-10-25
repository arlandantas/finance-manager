import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { newTokenValue } from "@/modules/mcp/tokens";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family } from "./acerto";
import type { World } from "./fixtures";

export type Who = "Mariana" | "Lucas";

/** Cliente de teste (CIMD "claude.ai"), criado direto no banco: nenhum fetch externo no E2E. */
export async function ensureClient() {
  const db = testDb();
  const clientId = "https://claude.ai/test-client.json";
  return db.mcpClient.upsert({
    where: { clientId },
    update: {},
    create: {
      clientId,
      kind: "CIMD",
      clientName: "Claude (teste)",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    },
  });
}

/** Conexão do membro gravada direto no banco (o fluxo OAuth é coberto na integração). */
export async function seedGrant(
  world: World,
  who: Who,
  o: {
    label?: string;
    write?: boolean;
    expiresAt?: string;
    status?: "ACTIVE" | "REVOKED";
    lastUsedAt?: string;
  } = {},
) {
  const fx = family(world);
  const client = await ensureClient();
  const m = fx.byName[who];
  if (!m) throw new Error(`membro ${who} inexistente`);
  return testDb().mcpGrant.create({
    data: {
      familyId: fx.family.id,
      memberId: m.memberId,
      userId: m.userId,
      clientId: client.id,
      label: o.label ?? "Meu Claude",
      scopes: o.write ? ["read", "write"] : ["read"],
      resource: "http://localhost:3101/api/mcp",
      status: o.status ?? "ACTIVE",
      expiresAt: new Date(o.expiresAt ?? "2026-11-03T15:00:00Z"),
      createdAt: new Date("2026-10-04T14:00:00Z"),
      ...(o.status === "REVOKED"
        ? { revokedAt: new Date("2026-10-04T14:30:00Z"), revokedReason: "MEMBER" as const }
        : {}),
      ...(o.lastUsedAt ? { lastUsedAt: new Date(o.lastUsedAt) } : {}),
    },
  });
}

/** Pedido de autorização válido (o que o /oauth/authorize gravaria), para abrir a tela de consentimento. */
export async function seedAuthorizationRequest(wantsWrite: boolean, o: { unknown?: boolean } = {}) {
  const client = o.unknown
    ? await testDb().mcpClient.create({
        data: {
          clientId: `dcr_${randomBytes(6).toString("hex")}`,
          kind: "DCR",
          clientName: "Banco Oficial",
          redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        },
      })
    : await ensureClient();
  const id = randomUUID();
  const nonce = randomBytes(24).toString("base64url");
  const row = await testDb().mcpAuthorizationRequest.create({
    data: {
      id,
      browserNonceHash: createHash("sha256").update(nonce).digest("hex"), // SEC-011
      clientId: client.id,
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "x".repeat(43),
      scopesRequested: wantsWrite ? ["read", "write"] : ["read"],
      resource: "http://localhost:3101/api/mcp",
      expiresAt: new Date("2026-10-05T15:00:00Z"),
    },
  });
  // cookie do navegador que iniciou o pedido (SEC-011)
  return { ...row, consentCookie: `${id}.${nonce}` };
}

export async function loginAsWho(world: World, page: Page, who: Who) {
  if (world.data.loggedAs !== who) {
    await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
    world.data.loggedAs = who;
  }
}

export async function openAssistant(world: World, page: Page, who: Who) {
  await loginAsWho(world, page, who);
  await gotoReady(page, "/configuracoes/assistente");
  await expect(page.getByRole("heading", { name: "Assistente de IA", level: 1 })).toBeVisible();
}

/** Evento de auditoria gravado direto no banco (o registro real nasce das chamadas; aqui só a leitura importa). */
export async function seedAuditEvent(
  world: World,
  who: Who,
  o: {
    grantId: string | null;
    tool?: string | null;
    kind?: "TOOL" | "CONNECTED" | "REVOKED" | "BLOCKED" | "LIMITS_CHANGED";
    outcome?: "OK" | "LIMIT_EXCEEDED" | "ERROR";
    params?: Record<string, unknown>;
    transactionId?: string | null;
    at: string;
    clientName?: string;
  },
) {
  const fx = family(world);
  const m = fx.byName[who];
  if (!m) throw new Error(`membro ${who} inexistente`);
  return testDb().mcpAuditEvent.create({
    data: {
      familyId: fx.family.id,
      memberId: m.memberId,
      grantId: o.grantId,
      clientName: o.clientName ?? "Claude (teste)",
      kind: o.kind ?? "TOOL",
      tool: o.tool ?? null,
      params: (o.params ?? {}) as never,
      outcome: o.outcome ?? "OK",
      transactionId: o.transactionId ?? null,
      durationMs: 5,
      createdAt: new Date(o.at),
    },
  });
}

const SERVER = "http://localhost:3101";

/** Token de acesso gravado direto no banco (só o hash): o "assistente" de teste fala com o /api/mcp real. */
export async function assistantToken(world: World, grantId: string): Promise<string> {
  const cache = (world.data.tokens as Record<string, string> | undefined) ?? {};
  if (cache[grantId]) return cache[grantId];
  const t = newTokenValue("ACCESS");
  await testDb().mcpToken.create({
    data: {
      grantId,
      kind: "ACCESS",
      tokenHash: t.hash,
      expiresAt: new Date("2027-06-01T00:00:00Z"),
    },
  });
  cache[grantId] = t.value;
  world.data.tokens = cache;
  return t.value;
}

/** `tools/call` no servidor de E2E (era 2025-11-25, sem sessão). */
export async function assistantCall(
  world: World,
  grantId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ status: number; ok: boolean; data: any; message: string; code: string }> {
  const token = await assistantToken(world, grantId);
  const res = await fetch(`${SERVER}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  const body = (await res.json()) as any;
  const result = body?.result;
  const err = result?.structuredContent?.error;
  return {
    status: res.status,
    ok: res.status === 200 && !result?.isError,
    data: result?.structuredContent,
    message: err?.message ?? result?.content?.[0]?.text ?? "",
    code: err?.code ?? "",
  };
}

export async function toolNames(world: World, grantId: string): Promise<string[]> {
  const token = await assistantToken(world, grantId);
  const res = await fetch(`${SERVER}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const body = (await res.json()) as any;
  return (body?.result?.tools ?? []).map((t: { name: string }) => t.name);
}
