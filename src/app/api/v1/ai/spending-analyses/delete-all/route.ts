import { withApi } from "@/lib/api/with-api";
import { deleteAllAnalyses } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

// US-073: apagar todo o histórico (qualquer membro). Descartes e lançamentos não são afetados.
export const POST = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await deleteAllAnalyses(tx, ctx),
}));
