import { conflict, forbidden, notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { recordAudit } from "@/modules/mcp/audit";
import { canonicalResource, mcpEnabled, PAT_CLIENT_NAME } from "@/modules/mcp/config";
import {
  type AssistantSettingsDTO,
  BLOCKED_NOTICE,
  type ConnectionDTO,
  type SetAssistantAccessInput,
} from "@/modules/mcp/connections-schemas";
import { revokeGrant, setAssistantAccess } from "@/modules/mcp/grants";
import type { SetConfirmationInput } from "@/modules/mcp/proposals-schemas";

// SDD-025 §3: lista, revogação e bloqueio da família. Cada membro só enxerga e revoga as SUAS conexões.
const CLOSED_LIMIT = 20;

type GrantRow = {
  id: string;
  kind: "OAUTH" | "PAT";
  label: string;
  scopes: string[];
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: ConnectionDTO["revokedReason"];
  requireConfirmation: boolean;
  client: { clientName: string; redirectUris: string[] } | null;
};

function hostOf(uri: string | undefined): string {
  try {
    return uri ? new URL(uri).hostname : "";
  } catch {
    return "";
  }
}

export function toConnectionDTO(g: GrantRow, now: Date): ConnectionDTO {
  const scopes = g.scopes.filter((s): s is "read" | "write" => s === "read" || s === "write");
  const expired = g.status === "ACTIVE" && g.expiresAt <= now;
  return {
    id: g.id,
    label: g.label,
    kind: g.kind,
    clientName: g.kind === "PAT" ? PAT_CLIENT_NAME : (g.client?.clientName ?? g.label),
    redirectHost: hostOf(g.client?.redirectUris[0]),
    scopes,
    scopeLabel: scopes.includes("write") ? "Consulta e lançamento" : "Consulta",
    status: expired ? "EXPIRED" : g.status,
    createdAt: g.createdAt.toISOString(),
    expiresAt: g.expiresAt.toISOString(),
    lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
    revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
    revokedReason: g.revokedReason,
    requireConfirmation: g.requireConfirmation,
  };
}

const grantInclude = { client: { select: { clientName: true, redirectUris: true } } } as const;

/** GET /assistant/settings. */
export async function getAssistantSettings(
  tx: Tx,
  ctx: RequestContext,
): Promise<AssistantSettingsDTO> {
  const now = ctx.clock.now();
  const fam = await tx.family.findFirst({
    where: { id: ctx.familyId },
    select: { assistantAccessEnabled: true, version: true },
  });
  const where = { familyId: ctx.familyId, memberId: ctx.memberId };
  const active = await tx.mcpGrant.findMany({
    where: { ...where, status: "ACTIVE", expiresAt: { gt: now } },
    include: grantInclude,
    orderBy: { createdAt: "desc" },
  });
  const closed = await tx.mcpGrant.findMany({
    where: {
      ...where,
      OR: [{ status: { not: "ACTIVE" } }, { status: "ACTIVE", expiresAt: { lte: now } }],
    },
    include: grantInclude,
    orderBy: { createdAt: "desc" },
    take: CLOSED_LIMIT,
  });
  const familyAllows = fam?.assistantAccessEnabled ?? true;
  return {
    mcpUrl: canonicalResource(),
    enabled: mcpEnabled(),
    familyAllows,
    canEditFamilySwitch: ctx.role === "ADMIN",
    familyVersion: fam?.version ?? 1,
    blockedNotice: !familyAllows ? BLOCKED_NOTICE : null,
    items: [...active, ...closed].map((g) => toConnectionDTO(g, now)),
  };
}

/** POST /assistant/connections/:id/revoke — só o dono; de outro membro ou família ⇒ 404 (mesma resposta). */
export async function revokeConnection(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ connection: ConnectionDTO }> {
  const now = ctx.clock.now();
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM mcp_grants WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "memberId" = ${ctx.memberId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound("Conexão não encontrada.");
  await revokeGrant(tx, id, "MEMBER", now, ctx.memberId);
  await tx.mcpToken.deleteMany({ where: { grantId: id } });
  const g = await tx.mcpGrant.findFirstOrThrow({ where: { id }, include: grantInclude });
  return { connection: toConnectionDTO(g, now) };
}

/** PATCH /family/assistant-access — só o Administrador; bloquear revoga TODAS as conexões da família. */
export async function setFamilyAssistantAccess(
  tx: Tx,
  ctx: RequestContext,
  input: SetAssistantAccessInput,
): Promise<AssistantSettingsDTO> {
  if (ctx.role !== "ADMIN") throw forbidden("Só o Administrador pode alterar");
  const rows = await tx.$queryRaw<
    Array<{ version: number; assistantAccessEnabled: boolean }>
  >`SELECT version, "assistantAccessEnabled" FROM families WHERE id = ${ctx.familyId}::uuid FOR UPDATE`;
  const fam = rows[0];
  if (!fam || fam.version !== input.familyVersion) {
    throw conflict("VERSION_CONFLICT", "A família foi alterada. Recarregue para continuar.");
  }
  if (fam.assistantAccessEnabled !== input.enabled) {
    const now = ctx.clock.now();
    const blocked = await tx.mcpGrant.findMany({
      where: { familyId: ctx.familyId, status: "ACTIVE" },
      select: { id: true },
    });
    await setAssistantAccess(tx, ctx.familyId, input.enabled, ctx.memberId, now);
    if (!input.enabled && blocked.length > 0) {
      await tx.mcpToken.deleteMany({ where: { grantId: { in: blocked.map((g) => g.id) } } });
    }
    await tx.family.update({
      where: { id: ctx.familyId },
      data: { version: { increment: 1 }, updatedByMemberId: ctx.memberId },
    });
    await tx.familyEvent.create({
      data: {
        familyId: ctx.familyId,
        type: "ASSISTANT_ACCESS_CHANGED",
        actorMemberId: ctx.memberId,
        changes: { enabled: { from: fam.assistantAccessEnabled, to: input.enabled } },
      },
    });
  }
  return getAssistantSettings(tx, ctx);
}

/** PATCH /assistant/connections/:id/confirmation — só o dono; desligado por padrão. Auditado (desligar aumenta o risco). */
export async function setConnectionConfirmation(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: SetConfirmationInput,
): Promise<{ connection: ConnectionDTO }> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; requireConfirmation: boolean; status: string }>
  >`SELECT id, "requireConfirmation", status FROM mcp_grants WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND "memberId" = ${ctx.memberId}::uuid FOR UPDATE`;
  const g = rows[0];
  if (!g) throw notFound("Conexão não encontrada.");
  if (g.status !== "ACTIVE") throw conflict("CONNECTION_INACTIVE", "A conexão não está ativa.");
  if (g.requireConfirmation !== input.requireConfirmation) {
    await tx.mcpGrant.update({
      where: { id },
      data: { requireConfirmation: input.requireConfirmation },
    });
    await recordAudit(tx, {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      grantId: id,
      clientName: "Configurações",
      kind: "TOOL",
      tool: "modo_confirmacao",
      params: { field: "requireConfirmation", reason: input.requireConfirmation ? "on" : "off" },
      outcome: "OK",
      at: ctx.clock.now(),
    });
  }
  const row = await tx.mcpGrant.findFirstOrThrow({ where: { id }, include: grantInclude });
  return { connection: toConnectionDTO(row, ctx.clock.now()) };
}
