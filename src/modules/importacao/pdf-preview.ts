import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, unprocessable } from "@/lib/api/errors";
import { canonicalJson } from "@/lib/api/idempotency";
import type { RequestContext, Tx } from "@/lib/api/types";
import { getLlmConfig } from "@/modules/ia/config";
import { costMicroBrl, estimateInputTokens, microToCentsCeil } from "@/modules/ia/pricing";
import { extractPdfText } from "./pdf-text";
import {
  candidateLines,
  MAX_LINES,
  MAX_PAYLOAD_BYTES,
  type RedactedLine,
  redactInvoiceLines,
} from "./redact";

// ADR-042 §4: o que seria enviado à IA, exatamente. Esta etapa NÃO chama o LLM nem grava nada.
const INVOICE_IMPORT_MAX_OUTPUT_TOKENS = 8000;
const INVOICE_IMPORT_SYSTEM_CHARS = 2500; // aproximação do prompt de extração (US-066c)

export const InvoiceLinesPayloadSchema = z
  .object({
    purpose: z.literal("INVOICE_IMPORT"),
    lines: z
      .array(
        z.object({ ref: z.string().regex(/^L\d+$/), text: z.string().min(1).max(200) }).strict(),
      )
      .max(MAX_LINES),
  })
  .strict();
export type InvoiceLinesPayload = z.infer<typeof InvoiceLinesPayloadSchema>;

export type PdfPreview = {
  source: "PDF";
  lines: RedactedLine[];
  previewHash: string;
  estimate?: { estimateInCents: number };
};

export const invoicePayloadHash = (payload: InvoiceLinesPayload): string =>
  createHash("sha256").update(canonicalJson(payload)).digest("hex");

/** Nomes, e-mails (de conta) e partes locais de membros atuais e ex-membros (titular incluso). */
async function peopleOf(tx: Tx, familyId: string): Promise<string[]> {
  const members = await tx.member.findMany({ where: { familyId }, include: { user: true } });
  const out: string[] = [];
  for (const m of members) {
    const e = m.user?.email;
    if (e) out.push(e, e.split("@")[0] ?? "");
    if (m.name) out.push(m.name);
    if (m.user?.name) out.push(m.user.name);
  }
  return out.filter(Boolean);
}

const tooLarge = () =>
  new ApiError(413, "IMPORT_TOO_LARGE", "O arquivo tem linhas demais. Divida em partes.");

/** Monta o payload validado (`.strict()`) a partir do texto; puro em relação ao banco. */
export function buildInvoicePayload(text: string, people: string[]): InvoiceLinesPayload {
  const raw = candidateLines(text);
  if (raw.length > MAX_LINES) throw tooLarge();
  const lines = redactInvoiceLines(raw, people);
  if (lines.length === 0) {
    throw unprocessable("NOT_AN_INVOICE", "Este arquivo não parece uma fatura de cartão.");
  }
  const payload = InvoiceLinesPayloadSchema.parse({ purpose: "INVOICE_IMPORT", lines });
  if (Buffer.byteLength(canonicalJson(payload), "utf8") > MAX_PAYLOAD_BYTES) throw tooLarge();
  return payload;
}

export async function previewInvoicePdf(
  tx: Tx,
  ctx: RequestContext,
  input: { bytes: Uint8Array; password?: string },
): Promise<PdfPreview> {
  const text = await extractPdfText(input.bytes, input.password);
  const payload = buildInvoicePayload(text, await peopleOf(tx, ctx.familyId));
  const out: PdfPreview = {
    source: "PDF",
    lines: payload.lines,
    previewHash: invoicePayloadHash(payload),
  };
  if (ctx.role === "ADMIN") {
    const cfg = getLlmConfig();
    const price = cfg.prices[process.env.LLM_MODEL_IMPORT?.trim() || "claude-haiku-5-5"];
    if (price) {
      const micro = costMicroBrl(
        {
          inputTokens: estimateInputTokens(
            INVOICE_IMPORT_SYSTEM_CHARS,
            Buffer.byteLength(canonicalJson(payload), "utf8"),
          ),
          outputTokens: INVOICE_IMPORT_MAX_OUTPUT_TOKENS,
        },
        price,
        cfg.LLM_USD_BRL_RATE,
      );
      out.estimate = { estimateInCents: microToCentsCeil(micro) };
    }
  }
  return out;
}
