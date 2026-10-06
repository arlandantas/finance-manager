// US-052 (SDD-018 §1.1): texto único do aviso do parcelado fora do acerto. Nenhum outro lugar escreve o texto.
import { INSTALLMENT_SPLIT_RELEASED } from "@/modules/cartoes/installments";

export const INSTALLMENT_SPLIT_NOTICE =
  "Compras parceladas ainda não entram na divisão do acerto. Elas contam como Só meu até uma próxima versão.";

/** O aviso só aparece com o acerto ligado e enquanto a US-042 não liberar o rateio por parcela. */
export function showInstallmentNotice(
  settlementEnabled: boolean,
  released: boolean = INSTALLMENT_SPLIT_RELEASED,
): boolean {
  return settlementEnabled && !released;
}

export function parcelasLabel(count: number): string {
  return `${count} ${count === 1 ? "parcela" : "parcelas"}`;
}
