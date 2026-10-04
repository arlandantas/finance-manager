/** Saldos resultantes de uma transferência (prévia da UI; o servidor é a fonte da verdade). */
export function transferPreview(
  balances: { from: number; to: number },
  amountInCents: number,
): { from: number; to: number; fromNegative: boolean } {
  const from = balances.from - amountInCents;
  return { from, to: balances.to + amountInCents, fromNegative: from < 0 };
}
