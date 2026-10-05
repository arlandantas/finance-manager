import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { archiveCard } from "@/modules/cartoes/archive";
import { ArchiveCardSchema } from "@/modules/cartoes/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.1: qualquer membro arquiva
export const POST = withApi({ body: ArchiveCardSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  return { status: 200, body: await archiveCard(tx, ctx, id.data, body.version) };
});
