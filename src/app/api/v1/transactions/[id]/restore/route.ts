import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { restoreTransaction } from "@/modules/transacoes/mutations";
import { TransactionStateSchema } from "@/modules/transacoes/schemas";

export const dynamic = "force-dynamic";

// SDD-001 §3
export const POST = withApi({ body: TransactionStateSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Lançamento não encontrado.");
  return { status: 200, body: await restoreTransaction(tx, ctx, id.data, body) };
});
