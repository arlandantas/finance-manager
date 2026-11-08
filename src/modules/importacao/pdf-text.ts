import { extractText, getDocumentProxy } from "unpdf";
import { ApiError, unprocessable } from "@/lib/api/errors";

// Spec 13 regra 5 / ADR-042 §2: texto extraído localmente (sem worker/canvas, serverless), sem OCR.
// A senha vive só nesta chamada: nunca é logada nem repassada em mensagem de erro.
export const MAX_PDF_PAGES = 30;
const MIN_USEFUL_CHARS = 20;

const passwordRequired = () =>
  unprocessable("PDF_PASSWORD_REQUIRED", "Este PDF tem senha. Informe a senha para continuar.");

/** Devolve o texto por linha; erros mapeados em `ApiError` sem vazar detalhes do arquivo. */
export async function extractPdfText(bytes: Uint8Array, password?: string): Promise<string> {
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), {
      ...(password ? { password } : {}),
    } as Record<string, unknown>);
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new ApiError(
        413,
        "IMPORT_TOO_LARGE",
        `O PDF tem mais de ${MAX_PDF_PAGES} páginas. Divida em partes.`,
      );
    }
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as { name?: string } | null)?.name === "PasswordException") throw passwordRequired();
    throw unreadable();
  }
  const text = pages.join("\n");
  if (text.replace(/\s/g, "").length < MIN_USEFUL_CHARS) throw unreadable();
  return text;
}

export const unreadable = () =>
  unprocessable(
    "IMPORT_UNREADABLE",
    "Não conseguimos ler o texto deste PDF. Envie o CSV da fatura ou um PDF com texto.",
  );
