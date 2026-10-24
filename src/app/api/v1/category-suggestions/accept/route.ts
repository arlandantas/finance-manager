import { withApi } from "@/lib/api/with-api";
import { AcceptSuggestionSchema } from "@/modules/analise-ia/schemas";
import { acceptCategorySuggestion } from "@/modules/analise-ia/suggestions";

export const dynamic = "force-dynamic";

// US-072: aceitar UMA sugestão (não existe "aceitar todas"). Muda só a categoria.
export const POST = withApi({ body: AcceptSuggestionSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await acceptCategorySuggestion(tx, ctx, body),
}));
