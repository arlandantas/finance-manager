/** Máscara de valores (US-027): puro, sem React. Largura fixa: não revela sinal nem ordem de grandeza. */
export const MONEY_MASK = "R$ •••••";

const MONEY_IN_TEXT = /-?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/** Troca valores em reais de um texto vindo do servidor pela máscara (alertas, erros). */
export function maskMoneyInText(text: string): string {
  return text.replace(MONEY_IN_TEXT, MONEY_MASK);
}
