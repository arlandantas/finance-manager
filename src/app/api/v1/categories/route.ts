import { withApi } from "@/lib/api/with-api";
import { CategoriesQuerySchema } from "@/modules/transacoes/schemas";
import { listCategories } from "@/modules/transacoes/service";

export const dynamic = "force-dynamic";

export const GET = withApi({ query: CategoriesQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listCategories(tx, ctx, query.kind),
}));
