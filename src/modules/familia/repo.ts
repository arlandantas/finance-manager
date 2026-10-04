import type { Tx } from "@/lib/api/types";
import { getDb } from "@/lib/db";
import { type Role, toRole } from "@/modules/familia/roles";

export type Membership = { memberId: string; familyId: string; familyName: string; role: Role };

/** Consulta fora do contexto de família (gate de entrada, /api/v1/me): vínculo do usuário. */
export async function findMembershipByUserId(
  userId: string,
  db: Pick<Tx, "member"> = getDb(),
): Promise<Membership | null> {
  const m = await db.member.findUnique({
    where: { userId },
    include: { family: { select: { name: true } } },
  });
  return m
    ? { memberId: m.id, familyId: m.familyId, familyName: m.family.name, role: toRole(m.role) }
    : null;
}
