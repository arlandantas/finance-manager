import { withApi } from "@/lib/api/with-api";
import { listCategorySuggestions } from "@/modules/analise-ia/suggestions";

export const dynamic = "force-dynamic";

// US-072: sugestões locais de categoria (sem IA). Qualquer membro; até 20.
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listCategorySuggestions(tx, ctx),
}));
