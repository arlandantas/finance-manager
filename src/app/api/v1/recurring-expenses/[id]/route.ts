import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UpdateRecurringExpenseSchema } from "@/modules/previstas/recurring-schemas";
import { getSeries, updateSeries } from "@/modules/previstas/recurring-service";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Despesa recorrente não encontrada.");
  return id.data;
};

export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getSeries(tx, ctx, parseId(params.id)),
}));

export const PATCH = withApi(
  { body: UpdateRecurringExpenseSchema },
  async ({ ctx, tx, body, params }) => ({
    status: 200,
    body: await updateSeries(tx, ctx, parseId(params.id), body),
  }),
);
