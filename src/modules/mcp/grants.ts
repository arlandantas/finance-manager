import type { McpRevokedReason, Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/modules/mcp/audit";

type Tx = Prisma.TransactionClient;

type GrantRow = {
  id: string;
  familyId: string;
  memberId: string;
  label: string;
  client: { clientName: string } | null;
};

async function revokeRows(
  tx: Tx,
  rows: GrantRow[],
  reason: McpRevokedReason,
  now: Date,
  byMemberId: string | null,
) {
  for (const g of rows) {
    const r = await tx.mcpGrant.updateMany({
      where: { id: g.id, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedReason: reason,
        revokedByMemberId: byMemberId,
      },
    });
    if (r.count === 0) continue;
    await recordAudit(tx, {
      familyId: g.familyId,
      memberId: g.memberId,
      grantId: g.id,
      clientName: g.client?.clientName ?? g.label,
      kind: reason === "FAMILY_BLOCKED" ? "BLOCKED" : "REVOKED",
      params: { reason },
      outcome: "OK",
      at: now,
    });
  }
}

const SELECT = {
  id: true,
  familyId: true,
  memberId: true,
  label: true,
  client: { select: { clientName: true } },
} as const;

/** Revoga uma conexão ativa (idempotente). Devolve se alguma linha mudou. */
export async function revokeGrant(
  tx: Tx,
  grantId: string,
  reason: McpRevokedReason,
  now: Date,
  byMemberId: string | null = null,
): Promise<boolean> {
  const g = await tx.mcpGrant.findFirst({
    where: { id: grantId, status: "ACTIVE" },
    select: SELECT,
  });
  if (!g) return false;
  await revokeRows(tx, [g], reason, now, byMemberId);
  return true;
}

/** Todas as conexões ativas de um membro (remoção, saída da família: ADR-019). */
export async function revokeMemberGrants(
  tx: Tx,
  familyId: string,
  memberId: string,
  reason: McpRevokedReason,
  now: Date,
  byMemberId: string | null = null,
) {
  const rows = await tx.mcpGrant.findMany({
    where: { familyId, memberId, status: "ACTIVE" },
    select: SELECT,
  });
  await revokeRows(tx, rows, reason, now, byMemberId);
}

/** Bloqueio/desbloqueio do acesso por assistente da família (ADR-030 §4). Só o ADMIN chama (rota na US-074). */
export async function setAssistantAccess(
  tx: Tx,
  familyId: string,
  enabled: boolean,
  actorMemberId: string,
  now: Date,
) {
  await tx.family.update({ where: { id: familyId }, data: { assistantAccessEnabled: enabled } });
  if (enabled) return;
  const rows = await tx.mcpGrant.findMany({
    where: { familyId, status: "ACTIVE" },
    select: SELECT,
  });
  await revokeRows(tx, rows, "FAMILY_BLOCKED", now, actorMemberId);
}
