import { notFound } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/response";
import { type RouteHandler, withApi } from "@/lib/api/with-api";
import { newId } from "@/lib/ids";
import { uuidSchema } from "@/lib/schemas";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { RevertImportBodySchema } from "@/modules/importacao/revert-schema";
import { revertImportBatch } from "@/modules/importacao/revert-service";

export const dynamic = "force-dynamic";

// US-069 (spec 13): desfaz o lote. `Idempotency-Key` obrigatório (padrão do `withApi`); já revertido = 200.
const handler = withApi({ body: RevertImportBodySchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Importação não encontrada.");
  return { status: 200, body: await revertImportBatch(tx, ctx, id.data, body) };
});

export const POST: RouteHandler = (req, route) =>
  invoiceImportEnabled()
    ? handler(req, route)
    : Promise.resolve(errorResponse(404, notFound().toBody(), newId()));
