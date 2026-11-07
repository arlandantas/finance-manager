/** Campos do formulário (SDD-031 §6.3): vários caminhos da API caem no mesmo campo. */
export type DoorField =
  | "amountInCents"
  | "source"
  | "categoryId"
  | "date"
  | "description"
  | "note"
  | "payer"
  | "installments"
  | "paidBeforeApp"
  | "tags"
  | "day"
  | "startMonth"
  | "end"
  | "split";

const FIELD_OF: Record<string, DoorField> = {
  amountInCents: "amountInCents",
  accountId: "source",
  cardId: "source",
  paymentAccountId: "source",
  categoryId: "categoryId",
  occurredOn: "date",
  dueOn: "date",
  description: "description",
  note: "note",
  payerMemberId: "payer",
  responsibleMemberId: "payer",
  installments: "installments",
  paidBeforeApp: "paidBeforeApp",
  tags: "tags",
  dayOfMonth: "day",
  startMonth: "startMonth",
  end: "end",
  split: "split", // US-043: "Os percentuais precisam somar 100%"
  isSharedExpense: "split",
};

export function fieldsFromIssues(
  issues: Array<{ path: string; message: string }>,
): Partial<Record<DoorField, string>> {
  const out: Partial<Record<DoorField, string>> = {};
  for (const i of issues) {
    const f = FIELD_OF[i.path.split(".")[0] as string];
    if (f && !out[f]) out[f] = i.message;
  }
  return out;
}
