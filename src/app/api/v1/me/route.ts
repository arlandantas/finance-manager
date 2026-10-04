import { withApi } from "@/lib/api/with-api";
import { getMe } from "@/modules/familia/service";

export const dynamic = "force-dynamic";

// SDD-003 §3.5
export const GET = withApi({ auth: "user" }, async ({ ctx, tx }) => ({
  status: 200,
  body: await getMe(tx, ctx),
}));
