import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { listHistory } from "@/modules/transacoes/mutations";

export const dynamic = "force-dynamic";

// SDD-001 §3
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Lançamento não encontrado.");
  return { status: 200, body: await listHistory(tx, ctx, id.data) };
});
