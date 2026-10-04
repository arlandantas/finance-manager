import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UndoPlannedPaymentSchema } from "@/modules/previstas/schemas";
import { undoPlannedPayment } from "@/modules/previstas/service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: UndoPlannedPaymentSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Despesa prevista não encontrada.");
    return { status: 200, body: await undoPlannedPayment(tx, ctx, id.data, body.version) };
  },
);
