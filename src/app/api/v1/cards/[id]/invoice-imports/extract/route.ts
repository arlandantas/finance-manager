import { notFound } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/response";
import { type RouteHandler, withApi } from "@/lib/api/with-api";
import { newId } from "@/lib/ids";
import { uuidSchema } from "@/lib/schemas";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { extractInvoiceImport } from "@/modules/importacao/extract-service";
import { readPreviewUpload } from "@/modules/importacao/multipart";
import { ExtractFieldsSchema } from "@/modules/importacao/schemas";

export const dynamic = "force-dynamic";

// Spec 13: só PDF. Não grava domínio (só o consumo de IA), então sem Idempotency-Key. A transação do
// handler espera o LLM (prazo de 60 s + folga), como a análise (US-070).
const handler = withApi(
  { multipart: true, idempotent: false, timeoutMs: 90_000 },
  async ({ ctx, tx, req, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Cartão não encontrado.");
    const upload = await readPreviewUpload(req, ExtractFieldsSchema);
    const draft = await extractInvoiceImport(tx, ctx, id.data, upload, req.signal);
    return { status: 200, body: draft };
  },
);

export const POST: RouteHandler = (req, route) =>
  invoiceImportEnabled()
    ? handler(req, route)
    : Promise.resolve(errorResponse(404, notFound().toBody(), newId()));
