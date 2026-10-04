import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { PayPlannedExpenseSchema } from "@/modules/previstas/schemas";
import { payPlannedExpense } from "@/modules/previstas/service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: PayPlannedExpenseSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Despesa prevista não encontrada.");
    return { status: 201, body: await payPlannedExpense(tx, ctx, id.data, body) };
  },
);
