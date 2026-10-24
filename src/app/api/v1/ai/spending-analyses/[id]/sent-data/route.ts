import { withApi } from "@/lib/api/with-api";
import { getSentData } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

// US-073: o que foi enviado nesta análise (o payload gravado; sem nomes nem dados de conta).
export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getSentData(tx, ctx, params.id as string),
}));
