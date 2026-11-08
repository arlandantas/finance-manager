import { withApi } from "@/lib/api/with-api";
import { dismissSettlementReview } from "@/modules/split/review";
import { DismissReviewSchema } from "@/modules/split/schemas";

export const dynamic = "force-dynamic";

// US-044
export const POST = withApi({ body: DismissReviewSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await dismissSettlementReview(tx, ctx, body.period),
}));
