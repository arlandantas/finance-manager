import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { DeletePlannedTransferSchema } from "@/modules/previstas/transfer-schemas";
import { deletePlannedTransfer } from "@/modules/previstas/transfer-service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: DeletePlannedTransferSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Transferência prevista não encontrada.");
    return { status: 200, body: await deletePlannedTransfer(tx, ctx, id.data, body.version) };
  },
);
