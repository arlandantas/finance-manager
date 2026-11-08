import { ApiError, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { openInvoiceRef } from "@/modules/cartoes/cycle";
import { activePayments } from "@/modules/cartoes/queries";
import { cartoesRepo } from "@/modules/cartoes/repo";
import { parseInvoiceCsv } from "./csv-parser";
import { detectFormat } from "./file-format";
import { type PdfPreview, previewInvoicePdf } from "./pdf-preview";
import { type ImportDraft, ImportDraftSchema } from "./schemas";
import { hashFile, issueImportToken } from "./token";

const MESSAGES: Record<string, string> = {
  CSV_COLUMNS_NOT_FOUND: "Não encontramos as colunas de data, descrição e valor.",
  NOT_AN_INVOICE: "Este arquivo não parece uma fatura de cartão.",
};
const GROUPS = { PURCHASE: "Compras", CREDIT: "Estornos e créditos" } as const;

/** Spec 13 regra 3: fatura alvo do cartão, ativa, não paga e não posterior à aberta. */
export async function assertTarget(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  invoiceRef: string,
) {
  const card = await cartoesRepo(tx, ctx.familyId).findById(cardId);
  if (!card) throw notFound("Cartão não encontrado.");
  if (card.archivedAt) {
    throw unprocessable("INVALID_REFERENCE", "Escolha um cartão", [
      { path: "cardId", message: "Escolha um cartão" },
    ]);
  }
  if (invoiceRef > openInvoiceRef(todayInFamilyTz(ctx.clock), card.closingDay)) {
    throw unprocessable("INVOICE_REF_INVALID", "Escolha a fatura aberta ou uma anterior.", [
      { path: "invoiceRef", message: "Fatura posterior à aberta" },
    ]);
  }
  const invoice = await tx.cardInvoice.findFirst({
    where: { cardId, familyId: ctx.familyId, referenceMonth: invoiceRef },
    select: { id: true },
  });
  if (invoice && (await activePayments(tx, ctx.familyId, [invoice.id])).has(invoice.id)) {
    throw unprocessable("INVOICE_PAID_LOCKED", "Esta fatura já foi paga e não aceita importação.");
  }
  return card;
}

/** US-066: valida e extrai; não grava nada, não loga o conteúdo do arquivo. */
export async function previewInvoiceImport(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  input: { bytes: Uint8Array; invoiceRef: string; password?: string | undefined },
): Promise<ImportDraft | PdfPreview> {
  const card = await assertTarget(tx, ctx, cardId, input.invoiceRef);
  const format = detectFormat(input.bytes);
  if (!format) {
    throw new ApiError(415, "IMPORT_FORMAT_NOT_ACCEPTED", "Formato não aceito. Envie PDF ou CSV.");
  }
  if (format.kind === "PDF") return previewInvoicePdf(tx, ctx, input);
  const parsed = parseInvoiceCsv(format.text, input.invoiceRef);
  if (!parsed.ok) {
    if (parsed.code === "IMPORT_TOO_LARGE") {
      throw new ApiError(413, "IMPORT_TOO_LARGE", "O arquivo tem linhas demais. Divida em partes.");
    }
    throw unprocessable(parsed.code, MESSAGES[parsed.code] ?? "Arquivo inválido.");
  }
  const fileHash = hashFile(input.bytes);
  const items = parsed.items.map((i) => ({
    idx: i.idx,
    date: i.date,
    description: i.description,
    amountInCents: String(i.amountInCents),
    kind: i.kind,
    installment: i.installment,
    selected: i.kind === "PURCHASE",
    group: GROUPS[i.kind],
    categoryId: null,
    payerMemberId: card.ownerMemberId,
    flags: [],
  }));
  // Totais definitivos (reconcileTotal, BigInt) chegam na US-067; aqui só a soma crua.
  const total = parsed.items.reduce(
    (s, i) => (i.kind === "PURCHASE" ? s + i.amountInCents : s - i.amountInCents),
    0n,
  );
  const selected = parsed.items.reduce(
    (s, i) => (i.kind === "PURCHASE" ? s + i.amountInCents : s),
    0n,
  );
  return ImportDraftSchema.parse({
    importToken: issueImportToken(
      { familyId: ctx.familyId, cardId, fileHash, source: "CSV" },
      ctx.clock.now(),
    ),
    source: "CSV",
    fileHash,
    invoiceRef: input.invoiceRef,
    declared: {},
    items,
    totals: { itemsTotal: String(total), selectedTotal: String(selected), difference: "0" },
    warnings: [],
  });
}
