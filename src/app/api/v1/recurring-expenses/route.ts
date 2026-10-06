import { withApi } from "@/lib/api/with-api";
import { CreateRecurringExpenseSchema } from "@/modules/previstas/recurring-schemas";
import { createSeries, listSeries } from "@/modules/previstas/recurring-service";

export const dynamic = "force-dynamic";

// SDD-019 §3.5 (ADR-025)
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listSeries(tx, ctx),
}));

export const POST = withApi({ body: CreateRecurringExpenseSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createSeries(tx, ctx, body),
}));
