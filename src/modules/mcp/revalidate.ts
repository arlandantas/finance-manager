import type { Prisma } from "@/generated/prisma/client";
import { assertCimdUrl, isCimdRedirectUri } from "@/modules/mcp/cimd";
import { revokeGrant } from "@/modules/mcp/grants";

type Tx = Prisma.TransactionClient;

/**
 * SEC-010 (SDD-028 §3.3): revalida os clientes CIMD gravados contra as regras atuais (URL exata + redirect no
 * mesmo host). Fora da regra: revoga as conexões (motivo `CLIENT`). Idempotente; só contagens.
 */
export async function revalidateMcpClients(
  tx: Tx,
  allowedClientIds: readonly string[],
  now: Date,
): Promise<{ invalidClients: number; revokedGrants: number }> {
  const clients = await tx.mcpClient.findMany({ where: { kind: "CIMD" } });
  let invalidClients = 0;
  let revokedGrants = 0;
  for (const c of clients) {
    let ok = c.redirectUris.length > 0;
    try {
      const host = assertCimdUrl(c.clientId, allowedClientIds).hostname;
      ok = ok && c.redirectUris.every((r) => isCimdRedirectUri(r, host));
    } catch {
      ok = false;
    }
    if (ok) continue;
    invalidClients++;
    const grants = await tx.mcpGrant.findMany({
      where: { clientId: c.id, status: "ACTIVE" },
      select: { id: true },
    });
    for (const g of grants) if (await revokeGrant(tx, g.id, "CLIENT", now)) revokedGrants++;
  }
  return { invalidClients, revokedGrants };
}
