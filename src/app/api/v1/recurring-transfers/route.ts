import { withApi } from "@/lib/api/with-api";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";
import { CreateTransferSeriesSchema } from "@/modules/previstas/transfer-schemas";
import { createTransferSeries, listTransferSeries } from "@/modules/previstas/transfer-series";

export const dynamic = "force-dynamic";

// US-101 (ADR-037 §5)
export const GET = withApi({ prepare: ensureRecurrenceHorizonStandalone }, async ({ ctx, tx }) => ({
  status: 200,
  body: await listTransferSeries(tx, ctx),
}));

export const POST = withApi({ body: CreateTransferSeriesSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createTransferSeries(tx, ctx, body),
}));
