import { withApi } from "@/lib/api/with-api";
import { listPayables } from "@/modules/previstas/payables";
import { PayablesQuerySchema } from "@/modules/previstas/schemas";

export const dynamic = "force-dynamic";

// SDD-009 §3: previstas PREVISTO + faturas fechadas (agregador "Contas a pagar")
export const GET = withApi({ query: PayablesQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listPayables(tx, ctx, query),
}));
