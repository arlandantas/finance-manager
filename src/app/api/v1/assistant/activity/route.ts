import { withApi } from "@/lib/api/with-api";
import { listActivity } from "@/modules/mcp/activity";
import { ActivityQuerySchema } from "@/modules/mcp/activity-schemas";

export const dynamic = "force-dynamic";

// SDD-027 §5.1: só os eventos do membro da sessão; nunca o conteúdo devolvido ao assistente.
export const GET = withApi({ query: ActivityQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listActivity(tx, ctx, query),
}));
