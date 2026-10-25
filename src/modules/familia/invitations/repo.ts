import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { getDb } from "@/lib/db";

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
      tx.member.findFirst({
        where: { familyId, removedAt: null, user: { email } },
        select: { id: true },
      }),
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
    /** SEC-004: recusas dos últimos 30 dias, para o Administrador ver "Recusado". */
    listDeclined: (since: Date) =>
      tx.invitation.findMany({
        where: { familyId, status: "DECLINED", declinedAt: { gte: since } },
        orderBy: [{ declinedAt: "desc" }, { id: "desc" }],
        take: 20,
      }),
    findById: (id: string) => tx.invitation.findFirst({ where: { id, familyId } }),
    cancel: (id: string, now: Date) =>
      tx.invitation.update({ where: { id }, data: { status: "CANCELED", canceledAt: now } }),
    family: () =>
      tx.family.findFirst({ where: { id: familyId }, select: { id: true, name: true } }),
    members: () =>
      tx.member.findMany({ where: { familyId, removedAt: null }, include: { user: true } }),
  };
}

/** Atualização do status de envio (melhor esforço, fora da transação do pedido). */
export async function setEmailStatus(id: string, emailStatus: "SENT" | "FAILED"): Promise<void> {
  await getDb().invitation.update({ where: { id }, data: { emailStatus } });
}

/** Consultas do convidado (ainda sem família). Nenhuma delas vincula ninguém (SEC-004). */
export const loginInvitations = {
  countValid: (tx: Pick<Tx, "invitation">, email: string, now: Date) =>
    tx.invitation.count({ where: { email, status: "PENDING", expiresAt: { gt: now } } }),
  listValid: (tx: Pick<Tx, "invitation">, email: string, now: Date) =>
    tx.invitation.findMany({
      where: { email, status: "PENDING", expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      include: { family: { select: { name: true } } },
    }),
  /** Convite pelo id, só se for do e-mail informado (outro e-mail = inexistente). */
  findOwn: (tx: Pick<Tx, "invitation">, id: string, email: string) =>
    tx.invitation.findFirst({
      where: { id, email },
      include: { family: { select: { name: true } } },
    }),
  hasExpired: async (
    tx: Pick<Tx, "invitation">,
    email: string,
    now: Date,
    windowStart: Date,
  ): Promise<boolean> =>
    (await tx.invitation.count({
      where: {
        email,
        OR: [
          { status: "PENDING", expiresAt: { lte: now } },
          { status: "EXPIRED", expiresAt: { gte: windowStart } },
        ],
      },
    })) > 0,
  /** PENDING e não vencido => ACCEPTED; devolve a contagem (1 = esta chamada venceu). */
  claim: async (tx: Tx, a: { id: string; userId: string; now: Date }) =>
    (
      await tx.invitation.updateMany({
        where: { id: a.id, status: "PENDING", expiresAt: { gt: a.now } },
        data: { status: "ACCEPTED", acceptedAt: a.now, acceptedByUserId: a.userId },
      })
    ).count,
  decline: async (tx: Tx, a: { id: string; userId: string; now: Date }) =>
    (
      await tx.invitation.updateMany({
        where: { id: a.id, status: "PENDING" },
        data: { status: "DECLINED", declinedAt: a.now, declinedByUserId: a.userId },
      })
    ).count,
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
