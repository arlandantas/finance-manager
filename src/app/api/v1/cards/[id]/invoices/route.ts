import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { listInvoices } from "@/modules/cartoes/invoice-service";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  return { status: 200, body: await listInvoices(tx, ctx, id.data) };
});
