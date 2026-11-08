import type { PrismaClient } from "@/generated/prisma/client";
import type { RequestContext } from "@/lib/api/types";
import type { Clock } from "@/lib/clock";
import { newId } from "@/lib/ids";
import { findActiveMembership } from "@/modules/familia/repo";
import { canonicalResource, type McpScope } from "@/modules/mcp/config";
import { hashToken } from "@/modules/mcp/tokens";

// SDD-024 §5.2: a ÚNICA porta de entrada das ferramentas. Monta o mesmo RequestContext do `withApi`.
export type McpContext = RequestContext & {
  grantId: string;
  scopes: McpScope[];
  clientName: string;
  grantLabel: string;
  /** US-076c: modo "exigir confirmação" da conexão. */
  requireConfirmation: boolean;
};

export type McpAuthReason =
  | "missing"
  | "unknown"
  | "expired"
  | "revoked"
  | "audience"
  | "membership"
  | "blocked";
export type McpAuthError = { code: "invalid_token"; description: McpAuthReason };

/** Mensagem pública: só "expirada" se distingue; as demais barreiras não são reveladas (BDD EN-006). */
export function publicAuthMessage(reason: McpAuthReason): string {
  return reason === "expired" ? "credencial expirada" : "não autorizado";
}

type Db = Pick<PrismaClient, "mcpToken" | "mcpGrant" | "mcpClient" | "user" | "member">;

const bad = (description: McpAuthReason): McpAuthError => ({ code: "invalid_token", description });

export async function resolveMcpContext(
  db: Db,
  bearer: string,
  clock: Clock,
  env: Record<string, string | undefined> = process.env,
): Promise<McpContext | McpAuthError> {
  if (!bearer) return bad("missing");
  const now = clock.now();
  const token = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(bearer) },
    include: {
      grant: {
        include: { client: true, family: { select: { assistantAccessEnabled: true } } },
      },
    },
  });
  if (!token || token.kind !== "ACCESS") return bad("unknown");
  if (token.expiresAt <= now) return bad("expired");
  const g = token.grant;
  if (g.status === "REVOKED") return bad("revoked");
  if (g.status === "EXPIRED" || g.expiresAt <= now) {
    if (g.status === "ACTIVE") {
      await db.mcpGrant.updateMany({
        where: { id: g.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
    }
    return bad("expired");
  }
  if (g.resource !== canonicalResource(env)) return bad("audience");
  if (!g.family.assistantAccessEnabled) return bad("blocked");
  const member = await findActiveMembership(g.userId, db);
  if (!member || member.id !== g.memberId || member.familyId !== g.familyId) {
    return bad("membership");
  }
  const user = await db.user.findUnique({ where: { id: g.userId } });
  if (!user) return bad("membership");

  // lastUsedAt no máximo 1x/min (evita escrita a cada chamada).
  const cutoff = new Date(now.getTime() - 60_000);
  await db.mcpGrant.updateMany({
    where: { id: g.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
    data: { lastUsedAt: now },
  });
  if (g.clientId) {
    await db.mcpClient.updateMany({
      where: { id: g.clientId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
      data: { lastUsedAt: now },
    });
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    clock,
    requestId: newId(),
    memberId: member.id,
    familyId: member.familyId,
    role: member.role,
    grantId: g.id,
    scopes: g.scopes.filter((s): s is McpScope => s === "read" || s === "write"),
    clientName: g.client?.clientName ?? g.label,
    grantLabel: g.label,
    requireConfirmation: g.requireConfirmation,
  };
}
