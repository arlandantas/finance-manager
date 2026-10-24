// Rótulos de período e textos compartilhados entre servidor e telas. PURO (sem imports de domínio).

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" ⇒ "out/2026". */
export function shortMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${SHORT[m - 1]}/${y}`;
}

export const ANALYSIS_DISCLAIMER =
  "Análise educativa. Não substitui um profissional. Nenhum dado foi alterado." as const;

export const NOT_ENOUGH_MONTHS_MSG = "Precisa de pelo menos 2 meses com lançamentos para analisar";
export const ANALYSIS_FAILED_MSG = "Não foi possível analisar agora. Tente novamente em instantes";
export const ANALYSIS_LIMIT = 3;
