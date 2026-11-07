import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UpdatePlannedTransferSchema } from "@/modules/previstas/transfer-schemas";
import { getPlannedTransfer, updatePlannedTransfer } from "@/modules/previstas/transfer-service";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Transferência prevista não encontrada.");
  return id.data;
};

export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getPlannedTransfer(tx, ctx, parseId(params.id)),
}));

export const PATCH = withApi(
  { body: UpdatePlannedTransferSchema },
  async ({ ctx, tx, body, params }) => ({
    status: 200,
    body: await updatePlannedTransfer(tx, ctx, parseId(params.id), body),
  }),
);
