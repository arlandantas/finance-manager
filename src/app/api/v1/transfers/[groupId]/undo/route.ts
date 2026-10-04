import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UndoTransferSchema } from "@/modules/contas/schemas";
import { undoTransferGroup } from "@/modules/contas/transfers";

export const dynamic = "force-dynamic";

// SDD-004 §3 e §4.4 (usado pela US-013b)
export const POST = withApi({ body: UndoTransferSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.groupId);
  if (!id.success) throw notFound("Transferência não encontrada.");
  return { status: 200, body: await undoTransferGroup(tx, ctx, id.data, body.version) };
});
