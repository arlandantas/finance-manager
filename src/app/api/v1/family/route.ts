import { withApi } from "@/lib/api/with-api";
import { getFamily } from "@/modules/familia/service";

export const dynamic = "force-dynamic";

// SDD-003 §4.5
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getFamily(tx, ctx),
}));
