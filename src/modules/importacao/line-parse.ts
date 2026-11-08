import { parseCsvAmount } from "./csv-amount";
import { extractInstallment } from "./csv-parser";
import { AMOUNT, DATE } from "./redact";

// Leitura heurística de UMA linha de fatura (puro). Serve à reconciliação (o valor e a data aparecem na
// linha?) e ao provedor simulado, que monta a "extração" com a mesma regra do CSV (ADR-042 §7).
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type LineDate = { day: number; month: number; year: number | null };

const toYear = (y: string | undefined): number | null =>
  y === undefined ? null : y.length === 2 ? 2000 + Number(y) : Number(y);

function parseDate(raw: string): LineDate | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return { day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) };
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(raw);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: toYear(m[3]) };
  m = /^(\d{1,2}) ([a-z]{3})/i.exec(raw);
  const month = m ? MONTHS.indexOf((m[2] as string).toLowerCase()) + 1 : 0;
  return m && month > 0 ? { day: Number(m[1]), month, year: null } : null;
}

/** Datas que aparecem no texto da linha, na ordem. */
export function lineDates(text: string): LineDate[] {
  const out: LineDate[] = [];
  for (const m of text.matchAll(DATE)) {
    const d = parseDate(m[0]);
    if (d && d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31) out.push(d);
  }
  return out;
}

/** Valores (módulo, centavos) que aparecem no texto da linha, na ordem. */
export function lineAmounts(text: string): bigint[] {
  const out: bigint[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const v = parseCsvAmount(m[0]);
    if (v !== null && v !== 0n) out.push(v < 0n ? -v : v);
  }
  return out;
}

export type HeuristicItem = {
  line: string;
  date: { day: number; month: number; year: number | null };
  description: string;
  amountInCents: number;
  kind: "PURCHASE" | "FEE" | "CREDIT" | "PAYMENT";
  installment: { no: number; count: number } | null;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Linha com data e valor => item; o último valor da linha é o da compra; sinal/termos definem o `kind`. */
export function heuristicItem(ref: string, text: string): HeuristicItem | null {
  const dateMatch = [...text.matchAll(DATE)].find((m) => parseDate(m[0]));
  const amountMatches = [...text.matchAll(AMOUNT)];
  const last = amountMatches[amountMatches.length - 1];
  if (!dateMatch || !last) return null;
  const date = parseDate(dateMatch[0]) as LineDate;
  const signed = parseCsvAmount(last[0]);
  if (signed === null || signed === 0n) return null;
  let rest = text;
  for (const m of [...amountMatches].reverse()) {
    rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
  }
  rest = rest.replace(dateMatch[0], " ").replace(/\s+/g, " ").trim();
  const { description, installment } = extractInstallment(rest);
  const n = fold(description);
  const kind =
    signed < 0n || /\b(estorno|credito)\b/.test(n)
      ? "CREDIT"
      : /\b(pagamento|pagto)\b/.test(n)
        ? "PAYMENT"
        : /\b(iof|juros|multa|anuidade|encargos?)\b/.test(n)
          ? "FEE"
          : "PURCHASE";
  return {
    line: ref,
    date,
    description: description.slice(0, 100) || rest.slice(0, 100) || "Item",
    amountInCents: Number(signed < 0n ? -signed : signed),
    kind,
    installment,
  };
}
