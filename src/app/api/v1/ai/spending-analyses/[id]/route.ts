import { withApi } from "@/lib/api/with-api";
import { getAnalysis } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getAnalysis(tx, ctx, params.id as string),
}));
