import type { Tx } from "@/lib/api/types";
import { fromCents } from "@/lib/money";

const withOwner = { owner: { include: { user: true } } } as const;

/** Cartões sempre escopados por `familyId` (ADR-013). */
export function cartoesRepo(tx: Tx, familyId: string) {
  return {
    list: (mode: "active" | "archived" | "all" = "active") =>
      tx.creditCard.findMany({
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
    findById: (id: string) =>
      tx.creditCard.findFirst({ where: { id, familyId, deletedAt: null }, include: withOwner }),
    /** `FOR UPDATE`: o PATCH do ciclo trava a linha (SDD-008 §4.8). */
    lockForUpdate: async (id: string) => {
      await tx.$queryRaw`SELECT id FROM credit_cards WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR UPDATE`;
    },
    /** `FOR SHARE`: a criação de fatura impede o PATCH do ciclo durante a escrita (SDD-008 §4.3). */
    lockForShare: async (id: string) => {
      await tx.$queryRaw`SELECT id FROM credit_cards WHERE id = ${id}::uuid AND "familyId" = ${familyId}::uuid FOR SHARE`;
    },
    memberExists: async (memberId: string) =>
      (await tx.member.count({ where: { id: memberId, familyId } })) > 0,
    member: (memberId: string) =>
      tx.member.findFirst({ where: { id: memberId, familyId }, include: { user: true } }),
    insert: (d: {
      name: string;
      institution: string;
      ownerMemberId: string;
      limitInCents: number;
      closingDay: number;
      dueDay: number;
      updatedByMemberId: string;
    }) =>
      tx.creditCard.create({
        data: { familyId, ...d, limitInCents: fromCents(d.limitInCents) },
        include: withOwner,
      }),
    updateVersioned: (
      id: string,
      version: number,
      d: {
        name?: string;
        institution?: string;
        ownerMemberId?: string;
        limitInCents?: number;
        closingDay?: number;
        dueDay?: number;
        updatedByMemberId: string;
      },
    ) =>
      tx.creditCard.updateMany({
        where: { id, familyId, version },
        data: {
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.institution !== undefined ? { institution: d.institution } : {}),
          ...(d.ownerMemberId !== undefined ? { ownerMemberId: d.ownerMemberId } : {}),
          ...(d.limitInCents !== undefined ? { limitInCents: fromCents(d.limitInCents) } : {}),
          ...(d.closingDay !== undefined ? { closingDay: d.closingDay } : {}),
          ...(d.dueDay !== undefined ? { dueDay: d.dueDay } : {}),
          updatedByMemberId: d.updatedByMemberId,
          version: { increment: 1 },
        },
      }),
  };
}
