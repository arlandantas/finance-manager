import { withApi } from "@/lib/api/with-api";
import { RequestAnalysisSchema } from "@/modules/analise-ia/schemas";
import { listAnalyses, requestAnalysis } from "@/modules/analise-ia/service";

export const dynamic = "force-dynamic";

// SDD-023 §3: histórico (qualquer membro).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listAnalyses(tx, ctx),
}));

// SDD-023 §3, §4.4: pede a análise. A transação do handler espera o LLM (prazo de 60 s + folga).
export const POST = withApi(
  { body: RequestAnalysisSchema, timeoutMs: 90_000 },
  async ({ ctx, tx, body, req }) => ({
    status: 201,
    body: await requestAnalysis(tx, ctx, body, req.signal),
  }),
);
