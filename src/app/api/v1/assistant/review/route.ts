import { withApi } from "@/lib/api/with-api";
import { getAssistantReview } from "@/modules/mcp/review";

export const dynamic = "force-dynamic";

// SDD-027 §R2.5: lançamentos via assistente do membro a conferir (cartão da Home).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getAssistantReview(tx, ctx),
}));
