import { withApi } from "@/lib/api/with-api";
import { HomeQuerySchema } from "@/modules/home/schemas";
import { getHome } from "@/modules/home/service";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";

export const dynamic = "force-dynamic";

// SDD-005 §3.2: um instantâneo consistente para todos os blocos
export const GET = withApi(
  {
    query: HomeQuerySchema,
    isolationLevel: "RepeatableRead",
    prepare: ensureRecurrenceHorizonStandalone,
  },
  async ({ ctx, tx, query }) => ({ status: 200, body: await getHome(tx, ctx, query.period) }),
);
