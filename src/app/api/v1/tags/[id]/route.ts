import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { renameTag } from "@/modules/tags/manage";
import { RenameTagSchema } from "@/modules/tags/schemas";

export const dynamic = "force-dynamic";

export const PATCH = withApi({ body: RenameTagSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Tag não encontrada.");
  return { status: 200, body: await renameTag(tx, ctx, id.data, body) };
});
