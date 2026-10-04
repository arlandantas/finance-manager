import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { DeletePlannedExpenseSchema } from "@/modules/previstas/schemas";
import { deletePlannedExpense } from "@/modules/previstas/service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: DeletePlannedExpenseSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Despesa prevista não encontrada.");
    return { status: 200, body: await deletePlannedExpense(tx, ctx, id.data, body.version) };
  },
);
