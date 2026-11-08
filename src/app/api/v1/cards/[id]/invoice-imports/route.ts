import { notFound } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/response";
import { type RouteHandler, withApi } from "@/lib/api/with-api";
import { newId } from "@/lib/ids";
import { uuidSchema } from "@/lib/schemas";
import { listInvoiceImports } from "@/modules/importacao/batches";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { ConfirmImportBodySchema } from "@/modules/importacao/confirm-schema";
import { confirmInvoiceImport } from "@/modules/importacao/confirm-service";

export const dynamic = "force-dynamic";

// US-068 (spec 13): confirma e grava o lote. `Idempotency-Key` obrigatório (padrão do `withApi`).
const handler = withApi(
  { body: ConfirmImportBodySchema, timeoutMs: 60_000 },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Cartão não encontrado.");
    return { status: 201, body: await confirmInvoiceImport(tx, ctx, id.data, body) };
  },
);

const lister = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  return { status: 200, body: await listInvoiceImports(tx, ctx, id.data) };
});

// US-069: lista os lotes do cartão.
export const GET: RouteHandler = (req, route) =>
  invoiceImportEnabled()
    ? lister(req, route)
    : Promise.resolve(errorResponse(404, notFound().toBody(), newId()));

export const POST: RouteHandler = (req, route) =>
  invoiceImportEnabled()
    ? handler(req, route)
    : Promise.resolve(errorResponse(404, notFound().toBody(), newId()));
