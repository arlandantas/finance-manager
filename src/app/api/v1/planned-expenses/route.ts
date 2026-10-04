import { withApi } from "@/lib/api/with-api";
import { CreatePlannedExpenseSchema, ListPlannedQuerySchema } from "@/modules/previstas/schemas";
import { createPlannedExpense, listPlannedExpenses } from "@/modules/previstas/service";

export const dynamic = "force-dynamic";

// SDD-009 §3
export const GET = withApi({ query: ListPlannedQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listPlannedExpenses(tx, ctx, query),
}));

export const POST = withApi({ body: CreatePlannedExpenseSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createPlannedExpense(tx, ctx, body),
}));
