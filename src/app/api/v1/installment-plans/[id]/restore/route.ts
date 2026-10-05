import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { restoreInstallmentPlan } from "@/modules/transacoes/installment-manage";
import { RestoreInstallmentPlanSchema } from "@/modules/transacoes/schemas";

export const dynamic = "force-dynamic";

// SDD-014 §3 (US-040b): o "Desfazer" da exclusão da compra inteira
export const POST = withApi(
  { body: RestoreInstallmentPlanSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Compra parcelada não encontrada.");
    return { status: 200, body: await restoreInstallmentPlan(tx, ctx, id.data, body) };
  },
);
