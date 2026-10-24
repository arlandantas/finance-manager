import { withApi } from "@/lib/api/with-api";
import { getAiUsage } from "@/modules/ia/service";

export const dynamic = "force-dynamic";

// SDD-021 §3: consumo de IA do mês (só ADMIN; a regra e a mensagem ficam no serviço).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getAiUsage(tx, ctx),
}));
