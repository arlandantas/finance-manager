import { parseCsvAmount, parseCsvDate } from "./csv-amount";
import { MAX_CSV_LINES, MAX_ITEMS } from "./file-format";

// Spec 13 regras 4 e 8: parser local e puro. Devolve o rascunho cru (sem categoria, flags ou totais).
export type RawItem = {
  idx: number;
  date: string;
  description: string;
  amountInCents: bigint; // sempre > 0; o sinal vira `kind`
  kind: "PURCHASE" | "CREDIT";
  installment: { no: number; count: number } | null;
};

export type CsvResult =
  | { ok: true; items: RawItem[] }
  | { ok: false; code: "CSV_COLUMNS_NOT_FOUND" | "NOT_AN_INVOICE" | "IMPORT_TOO_LARGE" };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Divide uma linha respeitando aspas ("a;b" e "" escapado). */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

type Columns = { date: number; description: number; amount: number };

function findColumns(cells: string[]): Columns | null {
  const names = cells.map(fold);
  const date = names.findIndex((n) => n === "date" || n.startsWith("data"));
  const amount = names.findIndex(
    (n, i) => i !== date && (n.startsWith("valor") || n === "value" || n === "amount"),
  );
  const description = names.findIndex(
    (n, i) =>
      i !== date &&
      i !== amount &&
      (/^(descricao|estabelecimento|historico|lancamento|titulo|title|description|detalhe)/.test(
        n,
      ) ||
        n.includes("descri")),
  );
  return date >= 0 && amount >= 0 && description >= 0 ? { date, description, amount } : null;
}

const INSTALLMENT_SUFFIX = /\s*[-–]?\s*(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;

/** "LOJA X 03/10" ou "LOJA X PARC 03/10" => descrição sem o sufixo e `{no:3,count:10}` (1≤n≤N, 2≤N≤24). */
export function extractInstallment(description: string): {
  description: string;
  installment: { no: number; count: number } | null;
} {
  const m = INSTALLMENT_SUFFIX.exec(description);
  if (!m) return { description, installment: null };
  const no = Number(m[1]);
  const count = Number(m[2]);
  if (no < 1 || no > count || count < 2 || count > 24) return { description, installment: null };
  const rest = description.slice(0, m.index).trim();
  return { description: rest === "" ? description : rest, installment: { no, count } };
}

function detectSeparator(header: string): string {
  const semi = (header.match(/;/g) ?? []).length;
  const comma = (header.match(/,/g) ?? []).length;
  const tab = (header.match(/\t/g) ?? []).length;
  if (tab > semi && tab > comma) return "\t";
  return comma > semi ? "," : ";";
}

export function parseInvoiceCsv(text: string, targetRef: string): CsvResult {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length > MAX_CSV_LINES) return { ok: false, code: "IMPORT_TOO_LARGE" };
  let cols: Columns | null = null;
  let sep = ";";
  let headerAt = -1;
  for (let i = 0; i < Math.min(lines.length, 10) && !cols; i++) {
    sep = detectSeparator(lines[i] as string);
    cols = findColumns(splitCsvLine(lines[i] as string, sep));
    headerAt = i;
  }
  if (!cols) return { ok: false, code: "CSV_COLUMNS_NOT_FOUND" };
  const items: RawItem[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    const cells = splitCsvLine(line, sep);
    const date = parseCsvDate(cells[cols.date] ?? "", targetRef);
    const signed = parseCsvAmount(cells[cols.amount] ?? "");
    const raw = (cells[cols.description] ?? "").replace(/\s+/g, " ").trim();
    if (!date || signed === null || signed === 0n || raw === "") continue; // rodapés e linhas soltas
    const { description, installment } = extractInstallment(raw);
    items.push({
      idx: items.length,
      date,
      description: description.slice(0, 100),
      amountInCents: signed < 0n ? -signed : signed,
      kind: signed < 0n ? "CREDIT" : "PURCHASE",
      installment,
    });
    if (items.length > MAX_ITEMS) return { ok: false, code: "IMPORT_TOO_LARGE" };
  }
  if (items.length === 0) return { ok: false, code: "NOT_AN_INVOICE" };
  return { ok: true, items };
}
