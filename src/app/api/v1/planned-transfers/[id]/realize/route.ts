import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { RealizeSchema } from "@/modules/previstas/transfer-schemas";
import { realizePlannedTransfer } from "@/modules/previstas/transfer-service";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: RealizeSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Transferência prevista não encontrada.");
  return { status: 201, body: await realizePlannedTransfer(tx, ctx, id.data, body) };
});
