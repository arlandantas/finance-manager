// Spec 13 regras 1-2: formato pelos bytes (nunca pela extensão) e limites do arquivo.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Folga do envelope multipart (cabeçalhos das partes) sobre o arquivo de 4 MB. */
export const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
export const MAX_CSV_LINES = 3000;
export const MAX_ITEMS = 300;

export type DetectedFormat = { kind: "PDF" } | { kind: "CSV"; text: string };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

/** Texto: sem NUL e sem controles além de TAB/LF/CR (PNG, ZIP etc. caem aqui). */
function looksLikeText(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b < 0x20 || b === 0x7f) return false;
  }
  return true;
}

function decode(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes); // Latin-1 dos bancos brasileiros
  }
  return text.replace(/^﻿/, "");
}

/** `null` = formato não aceito (415). Texto só vale como CSV se alguma das 10 primeiras linhas tem separador. */
export function detectFormat(bytes: Uint8Array): DetectedFormat | null {
  if (bytes.byteLength === 0) return null;
  if (isPdf(bytes)) return { kind: "PDF" };
  if (!looksLikeText(bytes)) return null;
  const text = decode(bytes);
  const head = text
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "")
    .slice(0, 10);
  if (!head.some((l) => /[;,\t]/.test(l))) return null;
  return { kind: "CSV", text };
}
