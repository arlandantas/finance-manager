// Origem fictícia só para resolver o caminho: o que importa é que o resultado continue nela.
const BASE = "http://callback.invalid";
// Somente caracteres ASCII imprimíveis de URL: sem controle, espaço, `\` ou Unicode invisível (SEC-003).
const SAFE_CHARS = /^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/;

/**
 * Aceita somente caminhos relativos locais (anti open redirect, SDD-003 §1, SEC-003).
 * O navegador remove TAB/LF/CR da URL (WHATWG): "/\t/evil" viraria "//evil". Por isso a lista é de
 * permissão e o resultado ainda é confirmado com `new URL`.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048 || !SAFE_CHARS.test(raw)) return "/";
  if (raw.startsWith("//") || /%(09|0a|0d|2f|5c)/i.test(raw) || raw.startsWith("/.//")) return "/";
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return "/";
  } catch {
    return "/";
  }
  return raw;
}
