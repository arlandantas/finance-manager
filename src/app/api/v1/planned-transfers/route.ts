import { withApi } from "@/lib/api/with-api";
import { ensureRecurrenceHorizonStandalone } from "@/modules/previstas/recurring-service";
import {
  CreatePlannedTransferSchema,
  ListPlannedTransfersQuerySchema,
} from "@/modules/previstas/transfer-schemas";
import { createPlannedTransfer, listPlannedTransfers } from "@/modules/previstas/transfer-service";

export const dynamic = "force-dynamic";

// US-100 (ADR-037)
export const GET = withApi(
  { query: ListPlannedTransfersQuerySchema, prepare: ensureRecurrenceHorizonStandalone }, // US-101
  async ({ ctx, tx, query }) => ({
    status: 200,
    body: await listPlannedTransfers(tx, ctx, query),
  }),
);

export const POST = withApi({ body: CreatePlannedTransferSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createPlannedTransfer(tx, ctx, body),
}));
