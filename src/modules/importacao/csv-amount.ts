// Valores e datas de CSV bancário (spec 13 regra 4). Texto e BigInt: sem float, sem arredondar.
const pad = (n: number) => String(n).padStart(2, "0");

/** "1.234,56" | "1234.56" | "-10,00" | "R$ 5" => centavos com sinal; inválido => null. */
export function parseCsvAmount(raw: string): bigint | null {
  let s = raw.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let whole: string;
  let frac = "";
  if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma > lastDot ? lastComma : lastDot;
    const digitsAfter = s.length - sep - 1;
    const onlyOneKind = lastComma < 0 || lastDot < 0;
    // "1.234" / "1,234" (um só tipo, 3 dígitos depois, mais de um grupo ou sem milhar à esquerda) = milhar
    const thousands = onlyOneKind && digitsAfter === 3 && !/^0[.,]/.test(s);
    const sepChar = s[sep] as string;
    if (thousands && !/^\d{1,3}([.,]\d{3})+$/.test(s)) return null;
    if (!thousands && s.slice(0, sep).includes(sepChar)) return null;
    if (thousands) {
      whole = s.replace(/[.,]/g, "");
    } else {
      whole = s.slice(0, sep).replace(/[.,]/g, "");
      frac = s.slice(sep + 1);
    }
  } else whole = s;
  if (!/^\d+$/.test(whole) || (frac !== "" && !/^\d{1,2}$/.test(frac))) return null;
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

function realDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** dd/mm/aaaa, dd/mm, aaaa-mm-dd. Sem ano: o ano da fatura alvo (mês depois do fechamento = ano anterior). */
export function parseCsvDate(raw: string, targetRef: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return realDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return realDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) {
    const [refY, refM] = targetRef.split("-").map(Number) as [number, number];
    const month = Number(m[2]);
    return realDate(month > refM ? refY - 1 : refY, month, Number(m[1]));
  }
  return null;
}
