/** Linguagem neutra do acerto (SDD-011 §4.3, RN-019.4): a palavra "deve" não existe aqui. Sem valores embutidos. */
export const SPLIT_COPY = {
  heroPending: (from: string, to: string, money: string) =>
    `Para equilibrar o mês: ${from} transfere ${money} para ${to}`,
  transfers: (from: string, to: string, money: string) => `${from} transfere ${money} para ${to}`,
  toSettle: (money: string) => `Valor a acertar: ${money}`,
  indicatorPending: (money: string) => `Acerto do mês: ${money} a acertar`,
  indicatorInOrder: "Acerto do mês: em dia",
  indicatorPrevious: (months: number, money: string) =>
    `Acertos pendentes de meses anteriores: ${months} ${months === 1 ? "mês" : "meses"} (${money})`,
  empty: "Nenhuma despesa dividida neste mês",
  emptyHint: "Marque despesas como Dividir com a família para vê-las aqui.",
  allOk: "Tudo certo neste mês",
  needsMembers: "O acerto exige pelo menos dois membros",
  disabled: "O acerto de contas está desligado nesta família",
  backHome: "Voltar para o início",
  personal: (n: number, money: string) =>
    `${n} ${n === 1 ? "despesa Só meu" : "despesas Só meu"} neste mês (${money})`,
} as const;
