import type { Tx } from "@/lib/api/types";

const memberWithUser = { user: true } as const;

/** Categorias sempre escopadas por `familyId` (ADR-013). */
export function categoriasRepo(tx: Tx, familyId: string) {
  return {
    list: (kind?: "EXPENSE" | "INCOME", includeArchived = false) =>
      tx.category.findMany({
        where: {
          familyId,
          ...(kind ? { kind } : {}),
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      }),
    findById: (id: string) => tx.category.findFirst({ where: { id, familyId } }),
    /** Serializa criação/arquivamento por (família, tipo) (SDD-007 §1). */
    lockKind: async (kind: "EXPENSE" | "INCOME") => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${familyId}:${kind}`}, 0))`;
    },
    countByKind: (kind: "EXPENSE" | "INCOME") => tx.category.count({ where: { familyId, kind } }),
    countActiveByKind: (kind: "EXPENSE" | "INCOME") =>
      tx.category.count({ where: { familyId, kind, archivedAt: null } }),
    /** Mesma família/tipo e nome normalizado (sem caixa, sem espaços nas pontas), arquivadas inclusive. */
    findByNormalizedName: async (kind: "EXPENSE" | "INCOME", name: string, exceptId?: string) => {
      const rows = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
        SELECT id, "archivedAt" FROM categories
        WHERE "familyId" = ${familyId}::uuid AND kind = ${kind}::"CategoryKind"
          AND lower(btrim(name)) = lower(btrim(${name}))`;
      return rows.find((r) => r.id !== exceptId) ?? null;
    },
    nextSortOrder: async () => {
      const agg = await tx.category.aggregate({ where: { familyId }, _max: { sortOrder: true } });
      return (agg._max.sortOrder ?? -1) + 1;
    },
    insert: (d: {
      kind: "EXPENSE" | "INCOME";
      name: string;
      icon: string;
      sortOrder: number;
      updatedByMemberId: string;
    }) => tx.category.create({ data: { familyId, ...d } }),
    updateVersioned: (
      id: string,
      version: number,
      data: { name?: string; icon?: string; updatedByMemberId: string },
    ) =>
      tx.category.updateMany({
        where: { id, familyId, version },
        data: { ...data, version: { increment: 1 } },
      }),
    setArchived: (id: string, version: number, archivedAt: Date | null, memberId: string) =>
      tx.category.updateMany({
        where: { id, familyId, version },
        data: { archivedAt, updatedByMemberId: memberId, version: { increment: 1 } },
      }),
    memberFirstName: async (memberId: string | null): Promise<string> => {
      if (!memberId) return "outra pessoa";
      const m = await tx.member.findFirst({
        where: { id: memberId, familyId },
        include: memberWithUser,
      });
      const full = m?.user.name ?? m?.user.email.split("@")[0] ?? "";
      return full.split(" ")[0] || "outra pessoa";
    },
  };
}
