import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict } from "@/lib/api/errors";
import { makeRepos } from "@/lib/api/repos";
import type { RequestContext, Tx, UserContext } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import type { SessionUser } from "@/lib/auth/session";
import { getClock } from "@/lib/clock";
import {
  acceptPendingInvitation,
  listPendingInvitations,
} from "@/modules/familia/invitations/service";
import {
  familiaRepo,
  findActiveMembership,
  findMembershipByUserId,
  findPendingRemovalNotice,
  type Membership,
} from "@/modules/familia/repo";
import { toRole } from "@/modules/familia/roles";
import type {
  CreateFamilyInput,
  CreateFamilyResponse,
  FamilyDTO,
  MeDTO,
} from "@/modules/familia/schemas";

export type AppEntry =
  | { redirectTo: string; membership: null }
  | { redirectTo?: undefined; membership: Membership };

/**
 * Gate de entrada (SDD-003 §5.6). Quem tem `Member` segue; senão tenta vincular por convite:
 * `JOINED` => Home com o aviso; `EXPIRED` => onboarding com aviso; `NONE` => onboarding.
 */
export async function resolveAppEntry(user: SessionUser): Promise<AppEntry> {
  const membership = await findMembershipByUserId(user.userId);
  if (membership) return { membership };
  const accepted = await acceptPendingInvitation(
    { id: user.userId, email: user.email, emailVerified: user.emailVerified },
    getClock(),
  );
  if (accepted.status === "JOINED") return { redirectTo: "/?joined=1", membership: null };
  if (accepted.status === "EXPIRED")
    return { redirectTo: "/onboarding?notice=invite_expired", membership: null };
  // ADR-019 §4: removido e ainda não avisado => aviso único de acesso encerrado
  const removed = await findPendingRemovalNotice(user.userId);
  if (removed) return { redirectTo: "/api/auth/membership-ended", membership: null };
  return { redirectTo: "/onboarding", membership: null };
}

export type OnboardingEntry = { redirectTo: string | null; expiredInvite: boolean };

/** Entrada da própria tela de onboarding (evita laço de redirecionamento do gate). */
export async function resolveOnboardingEntry(user: SessionUser): Promise<OnboardingEntry> {
  if (await findMembershipByUserId(user.userId)) return { redirectTo: "/", expiredInvite: false };
  const accepted = await acceptPendingInvitation(
    { id: user.userId, email: user.email, emailVerified: user.emailVerified },
    getClock(),
  );
  if (accepted.status === "JOINED") return { redirectTo: "/?joined=1", expiredInvite: false };
  return { redirectTo: null, expiredInvite: accepted.status === "EXPIRED" };
}

export async function getMe(
  tx: Pick<Tx, "member">,
  user: { userId: string; name: string | null; email: string; image: string | null },
): Promise<MeDTO> {
  const membership = await findMembershipByUserId(user.userId, tx);
  return {
    user: { id: user.userId, name: user.name, email: user.email, image: user.image },
    membership,
  };
}

const ALREADY_IN_FAMILY = "Você já faz parte de uma família.";

/** US-002 (SDD-003 §4.2): tudo ou nada, na transação do `withApi`. */
export async function createFamily(
  tx: Tx,
  ctx: Pick<UserContext, "userId" | "clock">,
  input: CreateFamilyInput,
): Promise<CreateFamilyResponse> {
  if (await findActiveMembership(ctx.userId, tx)) {
    throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
  }
  try {
    const family = await familiaRepo.insertFamily(tx, {
      name: input.name,
      ...(input.settlementEnabled !== undefined
        ? { settlementEnabled: input.settlementEnabled }
        : {}),
    });
    const member = await familiaRepo.insertMember(tx, {
      familyId: family.id,
      userId: ctx.userId,
      role: "ADMIN",
      joinedAt: ctx.clock.now(),
    });
    await familiaRepo.insertDefaultCategories(tx, family.id);
    await familiaRepo.insertInitialSplitRule(tx, {
      familyId: family.id,
      createdByMemberId: member.id,
    });
    return {
      family: { id: family.id, name: family.name },
      member: { id: member.id, role: "ADMIN" },
    };
  } catch (e) {
    // Corrida entre duas abas: UNIQUE(Member.userId) vence uma só.
    if (isUniqueViolation(e)) throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
    throw e;
  }
}

/** GET /api/v1/family (SDD-003 §4.5). Convites pendentes só para ADMIN. */
async function listFamilyEvents(tx: Tx, ctx: RequestContext): Promise<FamilyDTO["events"]> {
  const rows = await tx.familyEvent.findMany({
    where: { familyId: ctx.familyId },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 20,
  });
  const ids = [
    ...new Set(rows.flatMap((r) => [r.actorMemberId, r.targetMemberId ?? ""]).filter(Boolean)),
  ];
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId, id: { in: ids } },
    include: { user: true },
  });
  const name = (id: string) => {
    const m = members.find((x) => x.id === id);
    return { id, name: m ? (m.user.name ?? localPart(m.user.email)) : "Membro" };
  };
  return rows.map((r) => ({
    type: r.type,
    actor: name(r.actorMemberId),
    target: r.targetMemberId ? name(r.targetMemberId) : null,
    changes: (r.changes ?? {}) as Record<string, unknown>,
    at: r.at.toISOString(),
  }));
}

export async function getFamily(tx: Tx, ctx: RequestContext): Promise<FamilyDTO> {
  const repos = makeRepos(tx, ctx);
  const [family, members] = await Promise.all([
    repos.familia.getFamily(),
    repos.familia.listMembers(),
  ]);
  return {
    family: {
      id: ctx.familyId,
      name: family?.name ?? "",
      settlementEnabled: family?.settlementEnabled ?? true,
      version: family?.version ?? 1,
    },
    currentMemberId: ctx.memberId,
    currentRole: ctx.role,
    members: members.map((m) => ({
      memberId: m.id,
      name: m.user.name ?? localPart(m.user.email),
      email: m.user.email,
      image: m.user.image,
      role: toRole(m.role),
      joinedAt: m.joinedAt.toISOString(),
      canChangeRole: ctx.role === "ADMIN",
    })),
    exMembers: (await repos.familia.listExMembers()).map((m) => ({
      id: m.id,
      name: m.user.name ?? localPart(m.user.email),
      image: m.user.image,
      removedAt: (m.removedAt as Date).toISOString(),
    })),
    events: await listFamilyEvents(tx, ctx),
    pendingInvitations: ctx.role === "ADMIN" ? await listPendingInvitations(tx, ctx) : [],
  };
}
