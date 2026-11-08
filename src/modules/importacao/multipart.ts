import { ApiError, badRequest } from "@/lib/api/errors";
import { MAX_BODY_BYTES, MAX_FILE_BYTES } from "./file-format";
import { PreviewFieldsSchema } from "./schemas";

const tooLarge = () =>
  new ApiError(413, "IMPORT_FILE_TOO_LARGE", "O arquivo passa de 4 MB. Envie um menor.");

export type PreviewUpload = {
  bytes: Uint8Array;
  invoiceRef: string;
  password: string | undefined;
};

/** Lê o corpo com teto (recusa antes de ler tudo), interpreta o multipart e valida os campos. */
export async function readPreviewUpload(req: Request): Promise<PreviewUpload> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();
  const type = req.headers.get("content-type") ?? "";
  if (!req.body || !type.toLowerCase().startsWith("multipart/form-data")) {
    throw badRequest("INVALID_MULTIPART", "Envie o arquivo como multipart/form-data.");
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw badRequest("INVALID_MULTIPART", "Envie o arquivo como multipart/form-data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("VALIDATION_ERROR", "Envie o arquivo da fatura.");
  if (file.size > MAX_FILE_BYTES) throw tooLarge();
  const fields: Record<string, unknown> = {};
  for (const [name, value] of form.entries()) {
    if (name !== "file") fields[name] = typeof value === "string" ? value : "";
  }
  const parsed = PreviewFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw badRequest("VALIDATION_ERROR", details[0]?.message ?? "Dados inválidos.", details);
  }
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    invoiceRef: parsed.data.invoiceRef,
    password: parsed.data.password,
  };
}
