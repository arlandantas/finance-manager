import { withApi } from "@/lib/api/with-api";
import { getAssistantLimits, putAssistantLimits } from "@/modules/mcp/limits";
import { AssistantLimitsSchema } from "@/modules/mcp/limits-schemas";

export const dynamic = "force-dynamic";

// SDD-027 §R2.3: sempre os limites do MEMBRO da sessão (nem o ADMIN altera os dos outros).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getAssistantLimits(tx, ctx),
}));

export const PUT = withApi({ body: AssistantLimitsSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await putAssistantLimits(tx, ctx, body),
}));
