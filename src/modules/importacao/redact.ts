import { fold, memberWordSet } from "@/modules/analise-ia/payload";

// ADR-042 §4 / spec 13 regras 5-6: linhas candidatas e redação local. PURO (sem Next, Prisma, relógio).
// Só linhas que passam em `candidateLines` saem; cabeçalho, endereço, limite e número do cartão não passam.

const DATE =
  /(?<![\d/])(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2} (?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?)(?![\d/])/gi;
const AMOUNT =
  /(?<![\d.,])(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)|(?<![\d.,])(?:R\$\s*)?-?\d{1,9},\d{2}(?!\d)/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-\d{2}\b|\b\d{11}\b/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL = /[^\s@<>()]+@[^\s@<>()]+/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gov|io|app|br)\b\S*/gi;
const PHONE = /(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\s?\d{2}\s?\)|\b\d{2})[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const CEP = /\b\d{5}-?\d{3}\b/g;
const LONG_DIGITS = /\d(?:[ .-]?\d){3,}/g; // ≥ 4 dígitos, mesmo separados por espaço, ponto ou hífen

const TERMS = /\b(total|vencimento|pagamento|pagto|estorno|encargos?|iof|anuidade)\b/i;
const NEVER = /\b(limite|endere[cç]o|cep|ol[aá]|bem-vind[oa])\b/i;

const MAX_LINE_CHARS = 200;
export const MAX_LINES = 400;
export const MAX_PAYLOAD_BYTES = 48 * 1024;

const norm = (s: string) => fold(s.normalize("NFKC"));
const has = (re: RegExp, s: string) => {
  re.lastIndex = 0;
  return re.test(s);
};

/** Linhas com data + valor, ou com termo de total/vencimento/pagamento/estorno/encargo/IOF/anuidade. */
export function candidateLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const n = norm(line);
    if (has(NEVER, n)) continue;
    if ((has(DATE, line) && has(AMOUNT, line)) || has(TERMS, n)) out.push(line);
  }
  return out;
}

/** Protege valores e datas (placeholders) enquanto a redação roda; restaura no fim. */
function protect(line: string): { text: string; keep: string[] } {
  const keep: string[] = [];
  const hold = (m: string) => `\u0001${keep.push(m) - 1}\u0002`;
  const text = line.replace(DATE, hold).replace(AMOUNT, hold);
  return { text, keep };
}

function redactLine(line: string, words: Set<string>): string {
  const longNames = [...words].filter((n) => n.length >= 4);
  // identificadores estruturados primeiro, sobre o texto bruto (valores e datas não casam estes formatos)
  let t = line.normalize("NFKC").replace(/\p{Cf}/gu, ""); // zero-width e soft hyphen não escondem nomes
  for (const re of [EMAIL, URL_RE, CNPJ, CPF, CEP, PHONE]) t = t.replace(re, " ");
  const { text, keep } = protect(t);
  let r = text.replace(LONG_DIGITS, " ");
  r = r.replace(/\p{L}+/gu, (w) => {
    const bare = fold(w);
    if (bare.length >= 3 && words.has(bare)) return "pessoa";
    // nome colado em outra palavra ("JOAOSILVA"): nome com ≥ 4 letras como trecho
    return bare.length >= 4 && longNames.some((n) => bare.includes(n)) ? "pessoa" : w;
  });
  r = r.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[Number(i)] ?? "");
  return r.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);
}

export type RedactedLine = { ref: string; text: string };

/** `people`: nomes e e-mails de membros, ex-membros e titular. Refs opacas `L1..Ln`; linha vazia some. */
export function redactInvoiceLines(lines: string[], people: string[]): RedactedLine[] {
  const words = memberWordSet(people);
  const out: RedactedLine[] = [];
  for (const l of lines) {
    const text = redactLine(l, words);
    if (/\p{L}|\d/u.test(text)) out.push({ ref: `L${out.length + 1}`, text });
  }
  return out;
}
