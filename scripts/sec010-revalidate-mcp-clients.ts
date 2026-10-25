import { config } from "dotenv";
import { createPrismaClient } from "../src/lib/db";
import { cimdAllowedClientIds } from "../src/modules/mcp/config";
import { revalidateMcpClients } from "../src/modules/mcp/revalidate";

/**
 * SEC-010 (SDD-028 §3.3): rodar UMA vez após o deploy (idempotente). Lista os clientes CIMD gravados fora da
 * lista de URLs exatas (MCP_CIMD_ALLOWED_CLIENT_IDS) ou com redirect inválido e revoga as conexões deles.
 * Só imprime contagens.
 */
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const db = createPrismaClient();
db.$transaction((tx) => revalidateMcpClients(tx, cimdAllowedClientIds(), new Date()))
  .then(async (r) => {
    console.log(
      `clientes CIMD inválidos: ${r.invalidClients} · conexões revogadas: ${r.revokedGrants}`,
    );
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
