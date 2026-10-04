import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UpdatePlannedExpenseSchema } from "@/modules/previstas/schemas";
import { getPlannedExpense, updatePlannedExpense } from "@/modules/previstas/service";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Despesa prevista não encontrada.");
  return id.data;
};

export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getPlannedExpense(tx, ctx, parseId(params.id)),
}));

export const PATCH = withApi(
  { body: UpdatePlannedExpenseSchema },
  async ({ ctx, tx, body, params }) => ({
    status: 200,
    body: await updatePlannedExpense(tx, ctx, parseId(params.id), body),
  }),
);
