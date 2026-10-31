import type { Tx } from "@/lib/api/types";
import { toDbDate } from "@/lib/dates";
import { fromCents } from "@/lib/money";
import type { AccountColor } from "@/modules/contas/colors";

const withOwner = { owner: { include: { user: true } } } as const;

/** Contas sempre escopadas por `familyId` (ADR-013). */
export function contasRepo(tx: Tx, familyId: string) {
  return {
    /** `active` (padrão), `archived` ou `all`; contas EXCLUÍDAS nunca aparecem. */
    list: (mode: "active" | "archived" | "all" = "active") =>
      tx.bankAccount.findMany({
        where: {
          familyId,
          deletedAt: null,
          ...(mode === "active"
            ? { archivedAt: null }
            : mode === "archived"
              ? { archivedAt: { not: null } }
              : {}),
        },
        include: withOwner,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    /** Cores em uso (contas e cartões NÃO excluídos, inclusive arquivados) para `pickNextColor` (SDD-017 §4.3). */
    usedColors: async (): Promise<AccountColor[]> => {
      const rows = await tx.$queryRaw<Array<{ color: AccountColor }>>`
        SELECT "color" FROM "bank_accounts" WHERE "familyId" = ${familyId}::uuid AND "deletedAt" IS NULL
        UNION ALL
        SELECT "color" FROM "credit_cards" WHERE "familyId" = ${familyId}::uuid AND "deletedAt" IS NULL`;
      return rows.map((r) => r.color);
    },
    findById: (id: string) =>
      tx.bankAccount.findFirst({ where: { id, familyId, deletedAt: null }, include: withOwner }),
    /** Titular candidato (ativo, da família): `userId == null` = sem conta (US-093a, SDD-034 §3.2). */
    ownerCandidate: (memberId: string) =>
      tx.member.findFirst({
        where: { id: memberId, familyId, removedAt: null },
        select: { id: true, userId: true },
      }),
    insert: (data: {
      name: string;
      institution: string;
      type: "CHECKING" | "SAVINGS" | "CASH";
      ownerMemberId: string;
      excludeFromAvailable?: boolean;
      color: AccountColor;
    }) => tx.bankAccount.create({ data: { ...data, familyId }, include: withOwner }),
    /** Atualização com controle otimista: 0 linhas => versão antiga ou inexistente. */
    rename: (
      id: string,
      patch: { name?: string; excludeFromAvailable?: boolean; color?: AccountColor },
      version: number,
    ) =>
      tx.bankAccount.updateMany({
        where: { id, familyId, version },
        data: { ...patch, version: { increment: 1 } },
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
    accountsByIds: (ids: string[]) =>
      tx.bankAccount.findMany({
        where: { familyId, id: { in: ids }, deletedAt: null },
        select: { id: true, name: true },
      }),
    findMember: (id: string) =>
      tx.member.findFirst({ where: { id, familyId }, include: { user: true } }),
    insertTransferGroup: (d: {
      kind: "TRANSFER" | "SETTLEMENT";
      occurredOn: string;
      authorMemberId: string;
      settlement?: { period: string; fromMemberId: string; toMemberId: string };
    }) =>
      tx.transferGroup.create({
        data: {
          familyId,
          kind: d.kind,
          occurredOn: toDbDate(d.occurredOn),
          authorMemberId: d.authorMemberId,
          ...(d.settlement
            ? {
                settlementPeriod: d.settlement.period,
                settlementFromMemberId: d.settlement.fromMemberId,
                settlementToMemberId: d.settlement.toMemberId,
              }
            : {}),
        },
      }),
    insertLeg: (d: {
      kind: "TRANSFER_OUT" | "TRANSFER_IN";
      accountId: string;
      amountInCents: number;
      occurredOn: string;
      description: string;
      note: string | null;
      authorMemberId: string;
      transferGroupId: string;
    }) =>
      tx.transaction.create({
        data: {
          familyId,
          kind: d.kind,
          direction: d.kind === "TRANSFER_OUT" ? "DEBIT" : "CREDIT",
          accountId: d.accountId,
          amountInCents: fromCents(d.amountInCents),
          occurredOn: toDbDate(d.occurredOn),
          description: d.description,
          note: d.note,
          authorMemberId: d.authorMemberId,
          transferGroupId: d.transferGroupId,
        },
      }),
    findGroup: (groupId: string) =>
      tx.transferGroup.findFirst({
        where: { id: groupId, familyId },
        include: { legs: { include: { account: { select: { id: true, name: true } } } } },
      }),
    undoGroup: (groupId: string, version: number, memberId: string, now: Date) =>
      tx.transferGroup.updateMany({
        where: { id: groupId, familyId, version, deletedAt: null },
        data: { deletedAt: now, deletedByMemberId: memberId, version: { increment: 1 } },
      }),
    undoLegs: (groupId: string, memberId: string, now: Date) =>
      tx.transaction.updateMany({
        where: { familyId, transferGroupId: groupId, deletedAt: null },
        data: {
          deletedAt: now,
          deletedByMemberId: memberId,
          deletionReason: "UNDONE",
          updatedByMemberId: memberId,
          version: { increment: 1 },
        },
      }),
  };
}
