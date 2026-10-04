import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { CategoryStateSchema } from "@/modules/categorias/schemas";
import { archiveCategory } from "@/modules/categorias/service";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: CategoryStateSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Categoria não encontrada.");
  return { status: 200, body: await archiveCategory(tx, ctx, id.data, body.version) };
});
