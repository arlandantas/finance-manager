import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
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
export async function seedAuthorizationRequest(wantsWrite: boolean) {
  const client = await ensureClient();
  return testDb().mcpAuthorizationRequest.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "x".repeat(43),
      scopesRequested: wantsWrite ? ["read", "write"] : ["read"],
      resource: "http://localhost:3101/api/mcp",
      expiresAt: new Date("2026-10-05T15:00:00Z"),
    },
  });
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
