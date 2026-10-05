import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { removalReview } from "@/modules/familia/removal";

export const dynamic = "force-dynamic";

export const GET = withApi({ role: "ADMIN" }, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Membro não encontrado.");
  return { status: 200, body: await removalReview(tx, ctx, id.data) };
});
