import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { EndRecurringExpenseSchema } from "@/modules/previstas/recurring-schemas";
import { endSeries } from "@/modules/previstas/recurring-service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: EndRecurringExpenseSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Despesa recorrente não encontrada.");
    return { status: 200, body: await endSeries(tx, ctx, id.data, body.version) };
  },
);
