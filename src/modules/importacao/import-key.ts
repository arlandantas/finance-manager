import { createHash } from "node:crypto";
import { normalizeDescription } from "@/modules/analise-ia/recurring";

// ADR-042 §10 (PURO): chave de dedupe de um item importado. `ordinal` separa itens idênticos do mesmo arquivo.
export type KeyItem = {
  date: string | null;
  amountInCents: string | null;
  description: string;
  installment: { no: number; count: number } | null;
};

const identity = (i: KeyItem) =>
  [
    i.date ?? "",
    i.amountInCents ?? "",
    normalizeDescription(i.description),
    i.installment ? `${i.installment.no}/${i.installment.count}` : "",
  ].join("|");

export function importKey(
  cardId: string,
  invoiceRef: string,
  item: KeyItem,
  ordinal: number,
): string {
  const base = identity(item).split("|");
  // ordem fixa: cardId|invoiceRef|date|amount|descrição|n/N|ordinal
  const raw = [cardId, invoiceRef, ...base, String(ordinal)].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** Ordinal (1, 2, ...) de cada item entre os idênticos do ARQUIVO, na ordem recebida. */
export function occurrences(items: readonly KeyItem[]): number[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const id = identity(item);
    const ordinal = (seen.get(id) ?? 0) + 1;
    seen.set(id, ordinal);
    return ordinal;
  });
}

/** Identidade do item (sem ordinal): o par (identidade, ocorrência) não pode repetir num lote. */
export const identityOf = (i: KeyItem): string => identity(i);

/** Uma chave por item, na ordem recebida; o ordinal conta só entre itens idênticos. */
export function importKeys(
  cardId: string,
  invoiceRef: string,
  items: readonly KeyItem[],
): string[] {
  const ords = occurrences(items);
  return items.map((item, n) => importKey(cardId, invoiceRef, item, ords[n] as number));
}
