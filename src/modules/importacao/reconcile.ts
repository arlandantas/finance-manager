import { invoiceDates } from "@/modules/cartoes/cycle";
import { parseCsvDate } from "./csv-amount";
import type { ExtractedItem, InvoiceExtraction } from "./extraction-schema";
import { MAX_ITEMS } from "./file-format";
import { lineAmounts, lineDates } from "./line-parse";
import type { RedactedLine } from "./redact";
import type { ImportDraftItem } from "./schemas";

// Spec 13 regra 10 (PURO): o que o LLM devolveu só vira item se bater com as linhas enviadas. Nada aqui
// escreve; instrução dentro do arquivo não tem como virar ação (só dados validados, usuário confirma).
const GROUPS = {
  PURCHASE: "Compras",
  FEE: "Encargos",
  CREDIT: "Estornos e créditos",
  PAYMENT: "Pagamento da fatura",
} as const;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type ReconcileInput = {
  lines: RedactedLine[];
  extraction: InvoiceExtraction;
  invoiceRef: string;
  payerMemberId: string;
  closingDay: number;
  dueDay: number;
};

export type Reconciled =
  | { ok: false; code: "NOT_AN_INVOICE" | "TOO_MANY_ITEMS" }
  | {
      ok: true;
      items: Omit<ImportDraftItem, "occurrence">[];
      declared: { closingDate?: string; dueDate?: string; totalInCents?: string };
      warnings: { code: string; message: string }[];
    };

/** Data da linha que coincide com dia/mês do modelo; o ano vem da linha ou da fatura alvo (como no CSV). */
function resolveDate(iso: string, text: string, invoiceRef: string): string | null {
  const [, mm, dd] = iso.split("-").map(Number) as [number, number, number];
  const hit = lineDates(text).find((d) => d.day === dd && d.month === mm);
  if (!hit) return null;
  const mmStr = String(hit.month).padStart(2, "0");
  const ddStr = String(hit.day).padStart(2, "0");
  return hit.year !== null
    ? parseCsvDate(`${ddStr}/${mmStr}/${hit.year}`, invoiceRef)
    : parseCsvDate(`${ddStr}/${mmStr}`, invoiceRef);
}

function description(model: string, text: string): string {
  const clean = model.replace(/\s+/g, " ").trim();
  const ok = clean.length >= 2 && norm(text).includes(norm(clean)) && norm(clean) !== "";
  const chosen = ok ? clean : text.replace(/\s+/g, " ").trim();
  return chosen.slice(0, 100).padEnd(2, ".");
}

export function reconcileExtraction(input: ReconcileInput): Reconciled {
  const { extraction, lines, invoiceRef } = input;
  if (extraction.items.length > MAX_ITEMS) return { ok: false, code: "TOO_MANY_ITEMS" };
  if (!extraction.isInvoice) return { ok: false, code: "NOT_AN_INVOICE" };
  const byRef = new Map(lines.map((l) => [l.ref, l.text]));
  const seen = new Set<string>();
  const items: Omit<ImportDraftItem, "occurrence">[] = [];
  for (const it of extraction.items as ExtractedItem[]) {
    const text = byRef.get(it.line);
    if (text === undefined || seen.has(it.line)) continue; // linha inexistente ou repetida: descartada
    seen.add(it.line);
    const date = resolveDate(it.date, text, invoiceRef);
    const amountOk = lineAmounts(text).includes(BigInt(it.amountInCents));
    const attention = date === null || !amountOk;
    const installment =
      it.installment && it.installment.count >= 2
        ? { no: it.installment.no, count: it.installment.count }
        : null;
    items.push({
      idx: items.length,
      line: it.line,
      date: date ?? parseCsvDate(it.date, invoiceRef),
      description: description(it.description, text),
      amountInCents: String(it.amountInCents),
      kind: it.kind,
      installment,
      selected: it.kind === "PURCHASE" && !attention,
      group: GROUPS[it.kind],
      categoryId: null,
      payerMemberId: input.payerMemberId,
      flags: attention ? ["NEEDS_ATTENTION"] : [],
    });
  }
  if (items.length === 0) return { ok: false, code: "NOT_AN_INVOICE" };

  const declared: { closingDate?: string; dueDate?: string; totalInCents?: string } = {};
  const closing = extraction.closingDate;
  const closingText = closing ? byRef.get(closing.line) : undefined;
  if (closing && closingText !== undefined) {
    const d = resolveDate(closing.date, closingText, invoiceRef);
    if (d) declared.closingDate = d;
  }
  const due = extraction.dueDate;
  const dueText = due ? byRef.get(due.line) : undefined;
  if (due && dueText !== undefined) {
    const d = resolveDate(due.date, dueText, invoiceRef);
    if (d) declared.dueDate = d;
  }
  const total = extraction.totalInCents;
  const totalText = total ? byRef.get(total.line) : undefined;
  if (
    total &&
    totalText !== undefined &&
    lineAmounts(totalText).includes(BigInt(total.amountInCents))
  ) {
    declared.totalInCents = String(total.amountInCents);
  }

  const warnings: { code: string; message: string }[] = [];
  const expected = invoiceDates(invoiceRef, input.closingDay, input.dueDay);
  if (
    (declared.closingDate && declared.closingDate !== expected.closingDate) ||
    (declared.dueDate && declared.dueDate !== expected.dueDate)
  ) {
    warnings.push({
      code: "PERIOD_MISMATCH",
      message: "O fechamento ou o vencimento do arquivo não bate com a fatura escolhida.",
    });
  }
  return { ok: true, items, declared, warnings };
}
