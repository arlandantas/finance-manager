import { withApi } from "@/lib/api/with-api";
import { listReceivables } from "@/modules/previstas/payables";
import { ReceivablesQuerySchema } from "@/modules/previstas/schemas";

export const dynamic = "force-dynamic";

// SDD-017 §3 (US-051): receitas previstas pendentes do período ("A receber")
export const GET = withApi({ query: ReceivablesQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listReceivables(tx, ctx, query),
}));
