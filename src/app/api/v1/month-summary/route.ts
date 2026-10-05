import { withApi } from "@/lib/api/with-api";
import { MonthSummaryQuerySchema } from "@/modules/home/schemas";
import { getMonthSummary } from "@/modules/home/service";

export const dynamic = "force-dynamic";

// SDD-010 §3: mesmo bloco da Home, para navegar entre meses sem recarregar tudo
export const GET = withApi(
  { query: MonthSummaryQuerySchema, isolationLevel: "RepeatableRead" },
  async ({ ctx, tx, query }) => ({
    status: 200,
    body: await getMonthSummary(tx, ctx, query.period),
  }),
);
