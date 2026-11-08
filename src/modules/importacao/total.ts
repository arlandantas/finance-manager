// Spec 13 regra 14 (PURO, BigInt, sem server-only): o cliente recalcula a cada edição com esta função.
export type TotalItem = {
  kind: "PURCHASE" | "FEE" | "CREDIT" | "PAYMENT";
  amountInCents: string | bigint | null;
  selected: boolean;
};

export type Totals = { itemsTotal: bigint; selectedTotal: bigint; difference: bigint };

const cents = (v: string | bigint | null): bigint => (v === null ? 0n : BigInt(v));

/**
 * `itemsTotal = Σ PURCHASE + Σ FEE − Σ CREDIT` (todos os extraídos); `selectedTotal` = a mesma soma só dos
 * selecionados; `difference = declarado − itemsTotal` (com sinal; 0 sem total declarado). `PAYMENT` nunca entra.
 */
export function reconcileTotal(
  items: readonly TotalItem[],
  declaredTotalInCents?: string | bigint | null,
): Totals {
  let itemsTotal = 0n;
  let selectedTotal = 0n;
  for (const i of items) {
    if (i.kind === "PAYMENT") continue;
    const v = i.kind === "CREDIT" ? -cents(i.amountInCents) : cents(i.amountInCents);
    itemsTotal += v;
    if (i.selected) selectedTotal += v;
  }
  const declared =
    declaredTotalInCents === undefined || declaredTotalInCents === null
      ? null
      : BigInt(declaredTotalInCents);
  return {
    itemsTotal,
    selectedTotal,
    difference: declared === null ? 0n : declared - itemsTotal,
  };
}
