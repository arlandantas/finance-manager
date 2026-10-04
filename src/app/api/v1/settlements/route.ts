import { withApi } from "@/lib/api/with-api";
import { CreateSettlementSchema } from "@/modules/split/schemas";
import { registerSettlement } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-002 §3
export const POST = withApi({ body: CreateSettlementSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await registerSettlement(tx, ctx, body),
}));
