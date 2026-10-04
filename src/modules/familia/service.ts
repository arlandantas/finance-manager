import type { Tx } from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/session";
import { findMembershipByUserId, type Membership } from "@/modules/familia/repo";
import type { MeDTO } from "@/modules/familia/schemas";

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
