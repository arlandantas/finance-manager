import { withApi } from "@/lib/api/with-api";
import { deleteAnalysis } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

// US-073: apagar uma análise (DELETE físico do payload, do resultado e do mapa local).
export const POST = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await deleteAnalysis(tx, ctx, params.id as string),
}));
