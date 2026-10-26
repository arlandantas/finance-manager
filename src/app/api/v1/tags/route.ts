import { withApi } from "@/lib/api/with-api";
import { ListTagsQuerySchema } from "@/modules/tags/schemas";
import { listTags } from "@/modules/tags/service";

export const dynamic = "force-dynamic";

// SDD-016 §3: lista (sugestão ao digitar por prefixo de nameKey)
export const GET = withApi({ query: ListTagsQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listTags(tx, ctx, query),
}));
