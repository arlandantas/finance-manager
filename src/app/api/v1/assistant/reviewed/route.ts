import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { markAssistantReviewed } from "@/modules/mcp/review";

export const dynamic = "force-dynamic";

// SDD-027 §R2.5: "Marcar como conferidos".
export const POST = withApi({ body: z.object({}).strict() }, async ({ ctx, tx }) => ({
  status: 200,
  body: await markAssistantReviewed(tx, ctx),
}));
