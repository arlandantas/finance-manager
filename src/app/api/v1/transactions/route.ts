import { withApi } from "@/lib/api/with-api";
import { createInstallmentPurchase } from "@/modules/transacoes/installment-create";
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
  // SDD-014: cartão + 2 ou mais parcelas = plano com N lançamentos; 1x e à vista seguem o fluxo de sempre
  body:
    body.type === "EXPENSE" && body.installments > 1
      ? await createInstallmentPurchase(tx, ctx, body)
      : await createTransaction(tx, ctx, body),
}));
