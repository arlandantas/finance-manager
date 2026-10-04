import { badRequest, notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { payInvoice } from "@/modules/cartoes/payment-service";
import { InvoiceRefParamSchema, PayInvoiceSchema } from "@/modules/cartoes/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: PayInvoiceSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  const ref = InvoiceRefParamSchema.safeParse(params.ref);
  if (!ref.success) throw badRequest("VALIDATION_ERROR", "Fatura inválida.");
  return { status: 201, body: await payInvoice(tx, ctx, id.data, ref.data, body) };
});
