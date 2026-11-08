import { notFound } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/response";
import { type RouteHandler, withApi } from "@/lib/api/with-api";
import { newId } from "@/lib/ids";
import { uuidSchema } from "@/lib/schemas";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { readPreviewUpload } from "@/modules/importacao/multipart";
import { previewInvoiceImport } from "@/modules/importacao/preview-service";

export const dynamic = "force-dynamic";

// Spec 13: CSV direto (sem LLM); nada é gravado, então sem Idempotency-Key (não cria registro).
const handler = withApi(
  { multipart: true, idempotent: false },
  async ({ ctx, tx, req, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Cartão não encontrado.");
    const upload = await readPreviewUpload(req);
    const draft = await previewInvoiceImport(tx, ctx, id.data, upload);
    return { status: 200, body: draft };
  },
);

export const POST: RouteHandler = (req, route) =>
  invoiceImportEnabled()
    ? handler(req, route)
    : Promise.resolve(errorResponse(404, notFound().toBody(), newId()));
