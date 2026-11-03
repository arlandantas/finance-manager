// Mensagens da previsão por tipo (US-051, SDD-017 §2). PURO: sem Prisma e sem relógio.
// As de despesa são as mesmas da R2 (nenhuma mudou); as de receita acompanham o SDD-017 §3.
export type PlannedKindCopy = "EXPENSE" | "INCOME";

export type PlannedCopy = {
  created: string;
  notFound: string;
  alreadyPaid: string;
  notPaid: string;
  paidLocked: string;
  versionConflict: (name: string) => string;
  futureDate: string;
  linkedToPlanned: string;
  paidBadge: string;
  payAction: string;
  undoAction: string;
  payTitle: string;
};

const EXPENSE: PlannedCopy = {
  created: "Despesa prevista cadastrada",
  notFound: "Despesa prevista não encontrada.",
  alreadyPaid: "Esta despesa prevista já foi paga",
  notPaid: "Esta despesa prevista não está paga",
  paidLocked: "Despesa prevista paga não pode ser alterada. Use Desfazer pagamento.",
  versionConflict: (name) =>
    `Esta despesa prevista foi alterada por ${name}. Recarregue para continuar.`,
  futureDate: "A data do pagamento não pode ser futura",
  linkedToPlanned: "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.",
  paidBadge: "Paga",
  payAction: "Pagar",
  undoAction: "Desfazer pagamento",
  payTitle: "Pagar despesa prevista",
};

const INCOME: PlannedCopy = {
  created: "Receita prevista cadastrada",
  notFound: "Receita prevista não encontrada.",
  alreadyPaid: "Esta receita prevista já foi recebida",
  notPaid: "Esta receita prevista não foi recebida",
  paidLocked: "Receita prevista recebida não pode ser alterada. Use Desfazer recebimento.",
  versionConflict: (name) =>
    `Esta receita prevista foi alterada por ${name}. Recarregue para continuar.`,
  futureDate: "A data do recebimento não pode ser futura",
  linkedToPlanned: "Esta receita veio de uma receita prevista. Use Desfazer recebimento.",
  paidBadge: "Recebida",
  payAction: "Receber",
  undoAction: "Desfazer recebimento",
  payTitle: "Receber receita prevista",
};

export function plannedCopy(kind: PlannedKindCopy): PlannedCopy {
  return kind === "INCOME" ? INCOME : EXPENSE;
}
