import type { Prisma } from "@/generated/prisma/client";
import { PROPOSAL_RETENTION_DAYS } from "@/modules/mcp/proposals-schemas";

// SDD-024 §2: expurgo do MCP (rota /api/cron/purge e `pnpm mcp:purge`). Idempotente: só DELETE por data.
type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

export type McpPurgeCounts = {
  audit: number;
  tokens: number;
  requests: number;
  clients: number;
  buckets: number;
  proposals: number;
};

/** Auditoria > 12 meses; tokens vencidos há > 7 dias; pedidos expirados; clientes DCR sem grant e sem uso há 30 dias; buckets > 2 dias. */
export async function purgeMcp(tx: Tx, now: Date): Promise<McpPurgeCounts> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  // O gatilho só libera DELETE com esta variável (de transação) e linhas com mais de 12 meses.
  await tx.$executeRaw`SELECT set_config('app.mcp_purge', 'on', true)`;
  const audit = await tx.$executeRaw`DELETE FROM mcp_audit_events WHERE "createdAt" < ${ago(365)}`;
  await tx.$executeRaw`SELECT set_config('app.mcp_purge', 'off', true)`;
  const tokens = await tx.mcpToken.deleteMany({ where: { expiresAt: { lt: ago(7) } } });
  const requests = await tx.mcpAuthorizationRequest.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  const clients = await tx.mcpClient.deleteMany({
    where: {
      kind: "DCR",
      grants: { none: {} },
      requests: { none: {} },
      OR: [{ lastUsedAt: { lt: ago(30) } }, { lastUsedAt: null, createdAt: { lt: ago(30) } }],
    },
  });
  // US-076c: propostas NÃO confirmadas (pendentes esquecidas, recusadas, expiradas) somem após 30 dias; as confirmadas ficam (ligam ao lançamento)
  const proposals = await tx.assistantProposal.deleteMany({
    where: { status: { not: "CONFIRMED" }, createdAt: { lt: ago(PROPOSAL_RETENTION_DAYS) } },
  });
  const buckets = await tx.mcpRateBucket.deleteMany({ where: { windowStart: { lt: ago(2) } } });
  return {
    audit: Number(audit),
    tokens: tokens.count,
    requests: requests.count,
    clients: clients.count,
    buckets: buckets.count,
    proposals: proposals.count,
  };
}
