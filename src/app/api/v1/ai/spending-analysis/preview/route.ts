import { withApi } from "@/lib/api/with-api";
import { PreviewQuerySchema } from "@/modules/analise-ia/schemas";
import { getAnalysisPreview } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

// SDD-023 §3: "o que será enviado" (JSON exato + hash). NÃO chama o LLM.
export const GET = withApi({ query: PreviewQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await getAnalysisPreview(tx, ctx, query.period),
}));
