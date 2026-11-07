import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { EndTransferSeriesSchema } from "@/modules/previstas/transfer-schemas";
import { endTransferSeries } from "@/modules/previstas/transfer-series";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { body: EndTransferSeriesSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Transferência recorrente não encontrada.");
    return { status: 200, body: await endTransferSeries(tx, ctx, id.data, body.version) };
  },
);
