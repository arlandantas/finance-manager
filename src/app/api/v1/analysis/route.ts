import { withApi } from "@/lib/api/with-api";
import { AnalysisQuerySchema } from "@/modules/analise/schemas";
import { getAnalysis } from "@/modules/analise/service";

export const dynamic = "force-dynamic";

// US-048: visão sintética da família (totais + quebra por categoria), um instantâneo consistente
export const GET = withApi(
  { query: AnalysisQuerySchema, isolationLevel: "RepeatableRead" },
  async ({ ctx, tx, query }) => ({ status: 200, body: await getAnalysis(tx, ctx, query) }),
);
