import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { getTransfer } from "@/modules/contas/transfers";

export const dynamic = "force-dynamic";

// SDD-004 §3
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.groupId);
  if (!id.success) throw notFound("Transferência não encontrada.");
  return { status: 200, body: await getTransfer(tx, ctx, id.data) };
});
