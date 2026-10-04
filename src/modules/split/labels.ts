const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Nome do mês do período (SDD-002 §5.4): "Outubro"; com ano quando diferente do corrente. */
export function periodMonthLabel(key: string, currentYear: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const name = MONTHS[m - 1] as string;
  return y === currentYear ? name : `${name} de ${y}`;
}

export const settlementLabel = (key: string, currentYear: number) =>
  `Acerto de contas - ${periodMonthLabel(key, currentYear)}`;
