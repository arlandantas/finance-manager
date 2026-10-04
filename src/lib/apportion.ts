/**
 * Divide `total` (centavos inteiros >= 0) proporcionalmente a `weights` (inteiros >= 0, soma > 0).
 * Σ resultado === total, sempre. Desempate: maior resto, depois menor `ordinal`.
 */
export function apportion(
  total: number,
  parts: Array<{ key: string; weight: number; ordinal: number }>,
): Record<string, number> {
  const W = parts.reduce((acc, p) => acc + BigInt(p.weight), 0n);
  if (W === 0n) throw new RangeError("A soma dos pesos deve ser maior que zero");
  const T = BigInt(total);
  const calc = parts.map((p) => {
    const raw = T * BigInt(p.weight);
    return { key: p.key, ordinal: p.ordinal, base: raw / W, rem: raw % W };
  });
  const allocated = calc.reduce((acc, c) => acc + c.base, 0n);
  let extra = Number(T - allocated);
  const byRemainder = [...calc].sort((a, b) =>
    a.rem === b.rem ? a.ordinal - b.ordinal : a.rem > b.rem ? -1 : 1,
  );
  const bonus = new Set<string>();
  for (const c of byRemainder) {
    if (extra <= 0) break;
    bonus.add(c.key);
    extra--;
  }
  const out: Record<string, number> = {};
  for (const c of calc) out[c.key] = Number(c.base) + (bonus.has(c.key) ? 1 : 0);
  return out;
}
