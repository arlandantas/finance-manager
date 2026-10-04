import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { getDb } from "@/lib/db";

/** Transação própria (fora do `withApi`), usada pelo vínculo no login. */
export function withDbTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().$transaction(fn);
}

export const readDb = (): Pick<Tx, "invitation" | "member" | "session"> => getDb();

/** Convites sempre escopados por `familyId` (ADR-013). */
export function convitesRepo(tx: Tx, familyId: string) {
  return {
    expireStale: (email: string, now: Date) =>
      tx.invitation.updateMany({
        where: { familyId, email, status: "PENDING", expiresAt: { lt: now } },
        data: { status: "EXPIRED" },
      }),
    memberWithEmail: (email: string) =>
      tx.member.findFirst({ where: { familyId, user: { email } }, select: { id: true } }),
    insert: (data: {
      email: string;
      role: "ADMIN" | "MEMBER";
      tokenHash: string;
      expiresAt: Date;
      invitedByMemberId: string;
    }) => tx.invitation.create({ data: { ...data, familyId, emailStatus: "FAILED" } }),
    listPending: () =>
      tx.invitation.findMany({
        where: { familyId, status: "PENDING" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    findById: (id: string) => tx.invitation.findFirst({ where: { id, familyId } }),
    cancel: (id: string, now: Date) =>
      tx.invitation.update({ where: { id }, data: { status: "CANCELED", canceledAt: now } }),
    family: () =>
      tx.family.findFirst({ where: { id: familyId }, select: { id: true, name: true } }),
    members: () => tx.member.findMany({ where: { familyId }, include: { user: true } }),
  };
}

/** Atualização do status de envio (melhor esforço, fora da transação do pedido). */
export async function setEmailStatus(id: string, emailStatus: "SENT" | "FAILED"): Promise<void> {
  await getDb().invitation.update({ where: { id }, data: { emailStatus } });
}

/** Consultas do vínculo no login (não pertencem a uma família ainda). */
export const loginInvitations = {
  findValid: (tx: Tx, email: string, now: Date) =>
    tx.invitation.findFirst({
      where: { email, status: "PENDING", expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { family: { select: { name: true } } },
    }),
  hasExpired: async (tx: Tx, email: string, now: Date, windowStart: Date): Promise<boolean> =>
    (await tx.invitation.count({
      where: {
        email,
        OR: [
          { status: "PENDING", expiresAt: { lte: now } },
          { status: "EXPIRED", expiresAt: { gte: windowStart } },
        ],
      },
    })) > 0,
  accept: (tx: Tx, a: { id: string; userId: string; now: Date }) =>
    tx.invitation.update({
      where: { id: a.id },
      data: { status: "ACCEPTED", acceptedAt: a.now, acceptedByUserId: a.userId },
    }),
  insertMember: (tx: Tx, data: Prisma.MemberUncheckedCreateInput) => tx.member.create({ data }),
  findByTokenHash: (tx: Pick<Tx, "invitation">, tokenHash: string) =>
    tx.invitation.findUnique({
      where: { tokenHash },
      include: {
        family: { select: { name: true } },
      },
    }),
  memberName: async (tx: Pick<Tx, "member">, memberId: string): Promise<string> => {
    const m = await tx.member.findUnique({ where: { id: memberId }, include: { user: true } });
    return m?.user.name ?? m?.user.email.split("@")[0] ?? "Alguém";
  },
};
