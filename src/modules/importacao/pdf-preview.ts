import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, unprocessable } from "@/lib/api/errors";
import { canonicalJson } from "@/lib/api/idempotency";
import type { RequestContext, Tx } from "@/lib/api/types";
import { getLlmConfig } from "@/modules/ia/config";
import { costMicroBrl, estimateInputTokens, microToCentsCeil } from "@/modules/ia/pricing";
import { extractPdfText } from "./pdf-text";
import { INVOICE_IMPORT_PROMPT } from "./prompt";
import {
  candidateLines,
  MAX_LINES,
  MAX_PAYLOAD_BYTES,
  type RedactedLine,
  redactInvoiceLines,
} from "./redact";

// ADR-042 §4: o que seria enviado à IA, exatamente. Esta etapa NÃO chama o LLM nem grava nada.

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

/** Texto do PDF => payload redigido e validado: o mesmo que a pré-visualização mostra e a extração envia. */
export async function pdfPayload(
  tx: Tx,
  ctx: RequestContext,
  input: { bytes: Uint8Array; password?: string | undefined },
): Promise<InvoiceLinesPayload> {
  const text = await extractPdfText(input.bytes, input.password);
  return buildInvoicePayload(text, await peopleOf(tx, ctx.familyId));
}

export async function previewInvoicePdf(
  tx: Tx,
  ctx: RequestContext,
  input: { bytes: Uint8Array; password?: string | undefined },
): Promise<PdfPreview> {
  const payload = await pdfPayload(tx, ctx, input);
  const out: PdfPreview = {
    source: "PDF",
    lines: payload.lines,
    previewHash: invoicePayloadHash(payload),
  };
  if (ctx.role === "ADMIN") {
    const cfg = getLlmConfig();
    const price = cfg.prices[cfg.LLM_MODEL_IMPORT];
    if (price) {
      const micro = costMicroBrl(
        {
          inputTokens: estimateInputTokens(
            INVOICE_IMPORT_PROMPT.length,
            Buffer.byteLength(canonicalJson(payload), "utf8"),
          ),
          outputTokens: cfg.LLM_MAX_OUTPUT_TOKENS_IMPORT,
        },
        price,
        cfg.LLM_USD_BRL_RATE,
      );
      out.estimate = { estimateInCents: microToCentsCeil(micro) };
    }
  }
  return out;
}
