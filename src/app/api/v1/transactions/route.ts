import { withApi } from "@/lib/api/with-api";
import { CreateTransactionSchema, ListTransactionsQuerySchema } from "@/modules/transacoes/schemas";
import { createTransaction, listTransactions } from "@/modules/transacoes/service";

export const dynamic = "force-dynamic";

// SDD-001 §3 (criação) e SDD-005 §3.1 (extrato)
export const GET = withApi({ query: ListTransactionsQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listTransactions(tx, ctx, query),
}));

export const POST = withApi({ body: CreateTransactionSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createTransaction(tx, ctx, body),
}));
