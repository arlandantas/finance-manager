import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";

export type Change = { field: string; from: unknown; to: unknown };
export type RevisionAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "UNDO";

/**
 * Trilha de auditoria append-only (SDD-004 §4.5). `revision` = `version` resultante da linha.
 * CREATE: `changes = [{ field: "*", from: null, to: <snapshot> }]`.
 */
export async function recordRevision(
  tx: Tx,
  a: {
    familyId: string;
    transactionId: string;
    revision: number;
    action: RevisionAction;
    actorMemberId: string;
    changes: Change[];
  },
): Promise<void> {
  await tx.transactionRevision.create({
    data: { ...a, changes: a.changes as unknown as Prisma.InputJsonValue },
  });
}
