import { z } from "zod";

export const MAX_AMOUNT_IN_CENTS = 9_999_999_999;

export const amountInCentsSchema = z
  .number({ error: "Informe um valor maior que zero" })
  .int("Informe um valor maior que zero")
  .positive("Informe um valor maior que zero")
  .max(MAX_AMOUNT_IN_CENTS, "Valor acima do limite permitido");

/**
 * "R$ 1.250,90" -> 125090 ; "-R$ 300,00" -> -30000 ; "1250,9" -> 125090 ; inválido -> null.
 * Sem ponto flutuante: trabalha com texto e BigInt.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$/g, "").replace(/[\s ]/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/\./g, "");
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1] as string;
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = BigInt(whole) * 100n + BigInt(frac === "" ? "00" : frac);
  const value = negative ? -cents : cents;
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER))
    return null;
  return Number(value);
}

const brlWhole = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 125090 -> "R$ 1.250,90" ; -30000 -> "-R$ 300,00" (espaço NBSP conforme Intl). */
export function formatBRL(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const text = `${brlWhole.format(whole)},${frac}`;
  return cents < 0 ? `-${text}` : text;
}

export function toCents(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || BigInt(n) !== v)
    throw new RangeError("Valor fora da faixa segura");
  return n;
}

export function fromCents(n: number): bigint {
  if (!Number.isSafeInteger(n)) throw new RangeError("Centavos devem ser inteiros seguros");
  return BigInt(n);
}
