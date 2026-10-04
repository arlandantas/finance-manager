import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UpdateCategorySchema } from "@/modules/categorias/schemas";
import { updateCategory } from "@/modules/categorias/service";

export const dynamic = "force-dynamic";

export const PATCH = withApi({ body: UpdateCategorySchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Categoria não encontrada.");
  return { status: 200, body: await updateCategory(tx, ctx, id.data, body) };
});
