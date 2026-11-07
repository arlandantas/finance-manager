import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { mergeTag } from "@/modules/tags/manage";
import { MergeTagSchema } from "@/modules/tags/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: MergeTagSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Tag não encontrada.");
  return { status: 200, body: await mergeTag(tx, ctx, id.data, body) };
});
