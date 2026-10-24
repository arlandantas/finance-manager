import { ApiError, badRequest } from "@/lib/api/errors";

/** Teto do corpo JSON das rotas `/api/v1` (SEC-007). O MCP tem o próprio teto, menor (64 KB). */
export const MAX_API_BODY_BYTES = 256 * 1024;

const tooLarge = () =>
  new ApiError(413, "PAYLOAD_TOO_LARGE", "O corpo da requisição é grande demais.");

/** Lê e interpreta o corpo JSON com teto de bytes, mesmo sem `Content-Length` (SEC-007). */
export async function readJsonCapped(
  req: Request,
  maxBytes: number = MAX_API_BODY_BYTES,
): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!req.body) throw badRequest("INVALID_JSON", "Corpo da requisição inválido.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw badRequest("INVALID_JSON", "Corpo da requisição inválido.");
  }
}
