import { withApi } from "@/lib/api/with-api";
import { CategoriesQuerySchema, CreateCategorySchema } from "@/modules/categorias/schemas";
import { createCategory, listCategories } from "@/modules/categorias/service";

export const dynamic = "force-dynamic";

// SDD-007 §3
export const GET = withApi({ query: CategoriesQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listCategories(tx, ctx, query.kind, query.includeArchived ?? false),
}));

export const POST = withApi({ body: CreateCategorySchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createCategory(tx, ctx, body),
}));
