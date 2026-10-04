import { withApi } from "@/lib/api/with-api";
import { SettlementPeriodQuerySchema } from "@/modules/split/schemas";
import { listSharedExpenses } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-002 §3
export const GET = withApi({ query: SettlementPeriodQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listSharedExpenses(tx, ctx, query.period),
}));
