import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";

const withOwner = { owner: { include: { user: true } } } as const;

/** Contas sempre escopadas por `familyId` (ADR-013). */
export function contasRepo(tx: Tx, familyId: string) {
  return {
    list: () =>
      tx.bankAccount.findMany({
        where: { familyId },
        include: withOwner,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    findById: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId }, include: withOwner }),
    memberExists: async (memberId: string) =>
      (await tx.member.count({ where: { id: memberId, familyId } })) > 0,
    insert: (data: {
      name: string;
      institution: string;
      type: "CHECKING" | "SAVINGS" | "CASH";
      ownerMemberId: string;
    }) => tx.bankAccount.create({ data: { ...data, familyId }, include: withOwner }),
    /** Atualização com controle otimista: 0 linhas => versão antiga ou inexistente. */
    rename: (id: string, name: string, version: number) =>
      tx.bankAccount.updateMany({
        where: { id, familyId, version },
        data: { name, version: { increment: 1 } },
      }),
    insertOpening: (data: {
      accountId: string;
      direction: "CREDIT" | "DEBIT";
      amountInCents: number;
      occurredOn: string;
      authorMemberId: string;
    }) =>
      tx.transaction.create({
        data: {
          familyId,
          kind: "OPENING",
          direction: data.direction,
          accountId: data.accountId,
          amountInCents: fromCents(data.amountInCents),
          occurredOn: toDbDate(data.occurredOn),
          description: "Saldo inicial",
          authorMemberId: data.authorMemberId,
        },
      }),
  };
}
