import { withApi } from "@/lib/api/with-api";
import { CreateTransactionSchema } from "@/modules/transacoes/schemas";
import { createTransaction } from "@/modules/transacoes/service";

export const dynamic = "force-dynamic";

// SDD-001 §3 (a listagem GET entra com a US-007)
export const POST = withApi({ body: CreateTransactionSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createTransaction(tx, ctx, body),
}));
