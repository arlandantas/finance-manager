import { ApiError, conflict, unprocessable } from "@/lib/api/errors";
import { canonicalJson } from "@/lib/api/idempotency";
import type { RequestContext, Tx } from "@/lib/api/types";
import { getLlmConfig } from "@/modules/ia/config";
import { aiUnavailable } from "@/modules/ia/errors";
import { iaDb } from "@/modules/ia/repo";
import { runLlm } from "@/modules/ia/run";
import { hit } from "@/modules/mcp/rate-limit";
import { type InvoiceExtraction, InvoiceExtractionSchema } from "./extraction-schema";
import { registerInvoiceFakeFixtures } from "./fake-fixtures";
import { detectFormat } from "./file-format";
import { type InvoiceLinesPayload, invoicePayloadHash, pdfPayload } from "./pdf-preview";
import { assertTarget } from "./preview-service";
import { INVOICE_IMPORT_PROMPT } from "./prompt";
import { reconcileExtraction } from "./reconcile";
import { type ImportDraft, ImportDraftSchema } from "./schemas";
import { hashFile, issueImportToken } from "./token";

export const IMPORT_DAILY_LIMIT = 10;
const DAY_S = 24 * 60 * 60;

/** Devolve uma extração da cota do dia (o contador não pode ficar em 0: a linha some). */
async function giveBackQuota(key: string, now: Date): Promise<void> {
  const start = new Date(Math.floor(now.getTime() / (DAY_S * 1000)) * DAY_S * 1000);
  const db = iaDb();
  await db.$executeRaw`DELETE FROM mcp_rate_buckets WHERE "key" = ${key} AND "windowStart" = ${start} AND "count" <= 1`;
  await db.$executeRaw`UPDATE mcp_rate_buckets SET "count" = "count" - 1 WHERE "key" = ${key} AND "windowStart" = ${start} AND "count" > 1`;
}

/** US-066c: PDF => linhas redigidas => `runLlm(INVOICE_IMPORT)` => reconciliação local => rascunho. */
export async function extractInvoiceImport(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  input: {
    bytes: Uint8Array;
    invoiceRef: string;
    password?: string | undefined;
    previewHash?: string | undefined;
  },
  signal?: AbortSignal,
): Promise<ImportDraft> {
  const card = await assertTarget(tx, ctx, cardId, input.invoiceRef);
  const format = detectFormat(input.bytes);
  if (!format) {
    throw new ApiError(415, "IMPORT_FORMAT_NOT_ACCEPTED", "Formato não aceito. Envie PDF ou CSV.");
  }
  if (format.kind !== "PDF") {
    throw new ApiError(415, "IMPORT_FORMAT_NOT_ACCEPTED", "A leitura por IA vale só para PDF.");
  }
  if (!getLlmConfig().featuresEnabled) throw aiUnavailable();

  const payload = await pdfPayload(tx, ctx, input);
  if (invoicePayloadHash(payload) !== input.previewHash) {
    throw conflict("PREVIEW_STALE", "O arquivo mudou desde a pré-visualização. Confira de novo.");
  }
  registerInvoiceFakeFixtures(); // no-op com o provedor real

  const quotaKey = `invoice-import:${ctx.familyId}`;
  const run = await runLlm<InvoiceLinesPayload, InvoiceExtraction>(
    { familyId: ctx.familyId, memberId: ctx.memberId, clock: ctx.clock, requestId: ctx.requestId },
    {
      purpose: "INVOICE_IMPORT",
      payload,
      buildPrompt: (p) => ({ system: INVOICE_IMPORT_PROMPT, input: canonicalJson(p) }),
      outputSchema: InvoiceExtractionSchema,
      ...(signal ? { signal } : {}),
      // Na transação da reserva: se o consentimento ou o teto recusarem, a cota do dia volta junto.
      beforeReserve: async (rtx) => {
        const r = await hit(rtx, quotaKey, IMPORT_DAILY_LIMIT, DAY_S, ctx.clock.now());
        if (!r.ok) {
          throw new ApiError(
            429,
            "IMPORT_DAILY_LIMIT",
            "Você atingiu o limite de 10 leituras de PDF por dia. Tente amanhã ou envie o CSV.",
            { retryAfterS: r.retryAfterS },
          );
        }
      },
    },
  ).catch(async (e: unknown) => {
    // Recusa por teto/IA indisponível não gastou a cota do dia (a transação da reserva já foi confirmada).
    const refused =
      e instanceof ApiError &&
      ["LLM_BUDGET_EXCEEDED", "LLM_ESTIMATE_EXCEEDS_BUDGET", "AI_UNAVAILABLE"].includes(e.code);
    if (refused) await giveBackQuota(quotaKey, ctx.clock.now());
    throw e;
  });

  const rec = reconcileExtraction({
    lines: payload.lines,
    extraction: run.data,
    invoiceRef: input.invoiceRef,
    payerMemberId: card.ownerMemberId,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  });
  if (!rec.ok) {
    if (rec.code === "TOO_MANY_ITEMS") {
      throw new ApiError(
        502,
        "LLM_INVALID_RESPONSE",
        "Não foi possível usar a IA agora. Tente novamente em instantes",
      );
    }
    throw unprocessable("NOT_AN_INVOICE", "Este arquivo não parece uma fatura de cartão.");
  }
  const fileHash = hashFile(input.bytes);
  let itemsTotal = 0n;
  let selectedTotal = 0n;
  for (const i of rec.items) {
    const v = BigInt(i.amountInCents ?? "0");
    if (i.kind === "PURCHASE" || i.kind === "FEE") itemsTotal += v;
    else if (i.kind === "CREDIT") itemsTotal -= v;
    if (i.selected) selectedTotal += v;
  }
  const declaredTotal = rec.declared.totalInCents ? BigInt(rec.declared.totalInCents) : null;
  return ImportDraftSchema.parse({
    importToken: issueImportToken(
      { familyId: ctx.familyId, cardId, fileHash, source: "PDF" },
      ctx.clock.now(),
    ),
    source: "PDF",
    fileHash,
    invoiceRef: input.invoiceRef,
    declared: rec.declared,
    items: rec.items,
    totals: {
      itemsTotal: String(itemsTotal),
      selectedTotal: String(selectedTotal),
      difference: String(declaredTotal === null ? 0n : declaredTotal - itemsTotal),
    },
    warnings: rec.warnings,
  });
}
