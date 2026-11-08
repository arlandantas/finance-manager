import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { isInstallmentParcel } from "@/modules/transacoes/installment-parcels";
import { restoreInstallment } from "@/modules/transacoes/installment-state";
import { restoreTransaction } from "@/modules/transacoes/mutations";
import { TransactionStateSchema } from "@/modules/transacoes/schemas";

export const dynamic = "force-dynamic";

// SDD-001 §3
export const POST = withApi({ body: TransactionStateSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Lançamento não encontrado.");
  if (await isInstallmentParcel(tx, ctx, id.data)) {
    return { status: 200, body: await restoreInstallment(tx, ctx, id.data, body) };
  }
  return { status: 200, body: await restoreTransaction(tx, ctx, id.data, body) };
});
