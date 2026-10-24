import { withApi } from "@/lib/api/with-api";
import { getAssistantSettings } from "@/modules/mcp/connections";

export const dynamic = "force-dynamic";

// SDD-025 §3: todos os membros veem as SUAS conexões e o estado da chave da família.
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getAssistantSettings(tx, ctx),
}));
