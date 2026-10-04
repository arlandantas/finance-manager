import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict } from "@/lib/api/errors";
import { makeRepos } from "@/lib/api/repos";
import type { RequestContext, Tx, UserContext } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import type { SessionUser } from "@/lib/auth/session";
import { familiaRepo, findMembershipByUserId, type Membership } from "@/modules/familia/repo";
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
 * Gate de entrada (SDD-003 §5.6). Quem tem `Member` segue; senão vai ao onboarding
 * (a vinculação por convite entra com a US-003).
 */
export async function resolveAppEntry(user: SessionUser): Promise<AppEntry> {
  const membership = await findMembershipByUserId(user.userId);
  if (membership) return { membership };
  return { redirectTo: "/onboarding", membership: null };
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
  if (await tx.member.findUnique({ where: { userId: ctx.userId } })) {
    throw conflict("ALREADY_IN_FAMILY", ALREADY_IN_FAMILY);
  }
  try {
    const family = await familiaRepo.insertFamily(tx, { name: input.name });
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

/** GET /api/v1/family (SDD-003 §4.5). Convites pendentes entram com a US-003. */
export async function getFamily(tx: Tx, ctx: RequestContext): Promise<FamilyDTO> {
  const repos = makeRepos(tx, ctx);
  const [family, members] = await Promise.all([
    repos.familia.getFamily(),
    repos.familia.listMembers(),
  ]);
  return {
    family: { id: ctx.familyId, name: family?.name ?? "" },
    currentMemberId: ctx.memberId,
    currentRole: ctx.role,
    members: members.map((m) => ({
      memberId: m.id,
      name: m.user.name ?? localPart(m.user.email),
      email: m.user.email,
      image: m.user.image,
      role: toRole(m.role),
      joinedAt: m.joinedAt.toISOString(),
    })),
    pendingInvitations: [],
  };
}
