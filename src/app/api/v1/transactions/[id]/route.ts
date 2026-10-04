import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { getTransaction } from "@/modules/transacoes/service";

export const dynamic = "force-dynamic";

// SDD-001 §3 (PATCH/delete/restore/history entram com a US-013)
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Lançamento não encontrado.");
  return { status: 200, body: await getTransaction(tx, ctx, id.data) };
});
