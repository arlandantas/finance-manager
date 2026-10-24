import { withApi } from "@/lib/api/with-api";
import { DismissSuggestionSchema } from "@/modules/analise-ia/schemas";
import { dismissCategorySuggestion } from "@/modules/analise-ia/suggestions";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: DismissSuggestionSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await dismissCategorySuggestion(tx, ctx, body),
}));
