import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { loadInstallmentPlanDTO } from "@/modules/transacoes/installment-plan";

export const dynamic = "force-dynamic";

// SDD-014 §3: detalhe da compra parcelada ("Ver compra")
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Compra parcelada não encontrada.");
  return { status: 200, body: { plan: await loadInstallmentPlanDTO(tx, ctx, id.data) } };
});
