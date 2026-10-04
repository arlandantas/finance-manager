import { badRequest, notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { getInvoice } from "@/modules/cartoes/invoice-service";
import { InvoiceRefParamSchema } from "@/modules/cartoes/schemas";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  const ref = InvoiceRefParamSchema.safeParse(params.ref);
  if (!ref.success) throw badRequest("VALIDATION_ERROR", "Fatura inválida.");
  return { status: 200, body: await getInvoice(tx, ctx, id.data, ref.data) };
});
