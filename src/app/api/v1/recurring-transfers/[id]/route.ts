import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import {
  TransferSeriesQuerySchema,
  UpdateTransferSeriesSchema,
} from "@/modules/previstas/transfer-schemas";
import { getTransferSeries, updateTransferSeries } from "@/modules/previstas/transfer-series";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Transferência recorrente não encontrada.");
  return id.data;
};

export const GET = withApi(
  { query: TransferSeriesQuerySchema },
  async ({ ctx, tx, params, query }) => ({
    status: 200,
    body: await getTransferSeries(tx, ctx, parseId(params.id), query.impactFrom),
  }),
);

export const PATCH = withApi(
  { body: UpdateTransferSeriesSchema },
  async ({ ctx, tx, body, params }) => ({
    status: 200,
    body: await updateTransferSeries(tx, ctx, parseId(params.id), body),
  }),
);
