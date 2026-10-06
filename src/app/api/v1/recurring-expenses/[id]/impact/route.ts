import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { SeriesImpactQuerySchema } from "@/modules/previstas/recurring-schemas";
import { seriesImpact } from "@/modules/previstas/recurring-service";

export const dynamic = "force-dynamic";

export const GET = withApi(
  { query: SeriesImpactQuerySchema },
  async ({ ctx, tx, params, query }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Despesa recorrente não encontrada.");
    return { status: 200, body: await seriesImpact(tx, ctx, id.data, query.effectiveFrom) };
  },
);
