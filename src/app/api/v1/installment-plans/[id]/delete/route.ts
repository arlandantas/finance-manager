import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { deleteInstallmentPlan } from "@/modules/transacoes/installment-manage";
import { DeleteInstallmentPlanSchema } from "@/modules/transacoes/schemas";

export const dynamic = "force-dynamic";

// SDD-014 §3 (US-040b): exclui a compra parcelada inteira
export const POST = withApi(
  { body: DeleteInstallmentPlanSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Compra parcelada não encontrada.");
    return { status: 200, body: await deleteInstallmentPlan(tx, ctx, id.data, body) };
  },
);
