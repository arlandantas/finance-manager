import type { Tx } from "@/lib/api/types";
import { getDb } from "@/lib/db";
import { DEFAULT_CATEGORIES } from "@/modules/familia/default-categories";
import { type Role, toRole } from "@/modules/familia/roles";

export type Membership = {
  memberId: string;
  familyId: string;
  familyName: string;
  role: Role;
  settlementEnabled: boolean;
};

/** Consulta fora do contexto de família (gate de entrada, /api/v1/me): vínculo do usuário. */
export async function findMembershipByUserId(
  userId: string,
  db: Pick<Tx, "member"> = getDb(),
): Promise<Membership | null> {
  const m = await db.member.findUnique({
    where: { userId },
    include: { family: { select: { name: true, settlementEnabled: true } } },
  });
  return m
    ? {
        memberId: m.id,
        familyId: m.familyId,
        familyName: m.family.name,
        role: toRole(m.role),
        settlementEnabled: m.family.settlementEnabled,
      }
    : null;
}

/** Escritas da criação da família (ainda sem `familyId`): agrupadas para permitir falha injetada em teste. */
export const familiaRepo = {
  insertFamily(tx: Tx, data: { name: string; settlementEnabled?: boolean }) {
    return tx.family.create({
      data: {
        name: data.name,
        settlementEnabled: data.settlementEnabled ?? true,
        timezone: "America/Sao_Paulo",
        currency: "BRL",
        cutDay: 1,
      },
    });
  },
  insertMember(tx: Tx, data: { familyId: string; userId: string; role: Role; joinedAt: Date }) {
    return tx.member.create({ data });
  },
  insertDefaultCategories(tx: Tx, familyId: string) {
    return tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({
        familyId,
        kind: c.kind,
        name: c.name,
        icon: c.icon,
        sortOrder: i,
      })),
    });
  },
  insertInitialSplitRule(tx: Tx, data: { familyId: string; createdByMemberId: string }) {
    return tx.splitRuleVersion.create({
      data: {
        familyId: data.familyId,
        kind: "EQUAL",
        effectiveFrom: new Date("1970-01-01T00:00:00Z"),
        createdByMemberId: data.createdByMemberId,
      },
    });
  },
};

/** Leituras sempre escopadas por `familyId` (ADR-013). */
export function familiaScoped(tx: Tx, familyId: string) {
  return {
    getFamily: () => tx.family.findFirst({ where: { id: familyId } }),
    listMembers: () =>
      tx.member.findMany({
        where: { familyId },
        include: { user: true },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      }),
  };
}
