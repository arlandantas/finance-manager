import { withApi } from "@/lib/api/with-api";
import { removalReview } from "@/modules/familia/removal";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await removalReview(tx, ctx, ctx.memberId),
}));
