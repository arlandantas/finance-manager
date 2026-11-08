import { withApi } from "@/lib/api/with-api";
import { getSettlementReview } from "@/modules/split/review";
import { SettlementPeriodQuerySchema } from "@/modules/split/schemas";

export const dynamic = "force-dynamic";

// US-044
export const GET = withApi({ query: SettlementPeriodQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await getSettlementReview(tx, ctx, query.period),
}));
