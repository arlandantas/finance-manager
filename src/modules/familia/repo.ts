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

/** Única forma de ler o vínculo de um usuário (ADR-019 §2): o ATIVO (`removedAt` nulo). */
export function findActiveMembership(userId: string, db: Pick<Tx, "member"> = getDb()) {
  return db.member.findFirst({ where: { userId, removedAt: null } });
}

/** Vínculo REMOVED ainda sem o aviso de acesso encerrado (ADR-019 §4). */
export function findPendingRemovalNotice(userId: string, db: Pick<Tx, "member"> = getDb()) {
  return db.member.findFirst({
    where: { userId, removedAt: { not: null }, removalKind: "REMOVED", removalNoticeAt: null },
    orderBy: { removedAt: "desc" },
  });
}

export function markRemovalNoticed(memberId: string, at: Date, db: Pick<Tx, "member"> = getDb()) {
  return db.member.update({ where: { id: memberId }, data: { removalNoticeAt: at } });
}

/** Consulta fora do contexto de família (gate de entrada, /api/v1/me): vínculo do usuário. */
export async function findMembershipByUserId(
  userId: string,
  db: Pick<Tx, "member"> = getDb(),
): Promise<Membership | null> {
  const m = await db.member.findFirst({
    where: { userId, removedAt: null },
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
  /** EN-002a (ADR-016 §4, ADR-021 §3): famílias novas nascem STORED e com a migração marcada como nativa. */
  async insertFamily(tx: Tx, data: { name: string; settlementEnabled?: boolean }) {
    const family = await tx.family.create({
      data: {
        name: data.name,
        settlementEnabled: data.settlementEnabled ?? true,
        splitEngine: "STORED",
        timezone: "America/Sao_Paulo",
        currency: "BRL",
        cutDay: 1,
      },
    });
    await tx.dataMigration.create({
      data: {
        name: "en002_split_stored",
        familyId: family.id,
        state: "DONE",
        finishedAt: new Date(),
        report: { native: true },
      },
    });
    return family;
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
        where: { familyId, removedAt: null },
        include: { user: true },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      }),
    /** Ex-membros (histórico; só nome, nunca e-mail). */
    listExMembers: () =>
      tx.member.findMany({
        where: { familyId, removedAt: { not: null } },
        include: { user: true },
        orderBy: [{ removedAt: "desc" }, { id: "asc" }],
      }),
  };
}
