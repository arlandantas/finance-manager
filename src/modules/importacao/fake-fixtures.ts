import { getFakeAdapter } from "@/modules/ia/provider";
import type { InvoiceExtraction } from "./extraction-schema";
import { heuristicItem, lineAmounts, lineDates } from "./line-parse";

// ADR-042 §7: no provedor simulado, o cenário `ok` aplica o parser heurístico do CSV sobre as linhas
// recebidas (fluxo completo sem rede). O ano não vem nas linhas: o simulado usa um ano-guia e a
// reconciliação o resolve pela linha ou pela fatura alvo. Demais cenários: os de erro do Fake.
const PLACEHOLDER_YEAR = 2000;
const pad = (n: number) => String(n).padStart(2, "0");

export function fakeInvoiceExtraction(input: unknown): InvoiceExtraction {
  const lines = (input as { lines: { ref: string; text: string }[] }).lines;
  const items: InvoiceExtraction["items"] = [];
  let totalLine: InvoiceExtraction["totalInCents"] = null;
  let dueLine: InvoiceExtraction["dueDate"] = null;
  const iso = (d: { day: number; month: number; year: number | null }) =>
    `${d.year ?? PLACEHOLDER_YEAR}-${pad(d.month)}-${pad(d.day)}`;
  for (const l of lines) {
    const n = l.text.toLowerCase();
    const first = lineDates(l.text)[0];
    if (n.includes("vencimento") && first) {
      dueLine ??= { line: l.ref, date: iso(first) };
      continue;
    }
    const it = heuristicItem(l.ref, l.text);
    if (it) {
      items.push({
        line: l.ref,
        date: iso(it.date),
        description: it.description,
        amountInCents: it.amountInCents,
        kind: it.kind,
        installment: it.installment,
      });
    } else if (/\btotal\b/.test(n) && !totalLine) {
      const cents = lineAmounts(l.text)[0];
      if (cents) totalLine = { line: l.ref, amountInCents: Number(cents) };
    }
  }
  return {
    isInvoice: items.length > 0,
    closingDate: null,
    dueDate: dueLine,
    totalInCents: totalLine,
    items,
  };
}

/** Registra (uma vez) as respostas simuladas da importação no provedor fake; no-op com o real. */
export function registerInvoiceFakeFixtures(): void {
  const fake = getFakeAdapter();
  if (fake && !fake.fixtures.INVOICE_IMPORT) {
    fake.fixtures = {
      ...fake.fixtures,
      INVOICE_IMPORT: {
        ok: fakeInvoiceExtraction,
        invalid_json: "{ isInvoice: ",
        schema_violation: { isInvoice: "sim", items: "x" },
      },
    };
  }
}
