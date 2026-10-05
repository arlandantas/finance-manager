import { findSessionUser, parseCookieHeader, sessionTokenFromCookies } from "@/lib/auth/session";
import { endSessionFromCookies } from "@/lib/auth/sign-out";
import { getClock } from "@/lib/clock";
import { getDb } from "@/lib/db";
import { findPendingRemovalNotice, markRemovalNoticed } from "@/modules/familia/repo";

export type MembershipEndedResult = "NO_SESSION" | "NO_NOTICE" | "NOTICED";

/**
 * Aviso único de acesso encerrado (ADR-019 §4): grava `removalNoticeAt` do último vínculo REMOVED e
 * encerra a sessão. Sem aviso pendente não mexe em nada.
 */
export async function consumeMembershipEnded(
  cookieHeader: string | null,
): Promise<MembershipEndedResult> {
  const cookies = parseCookieHeader(cookieHeader);
  const db = getDb();
  const user = await findSessionUser(db, sessionTokenFromCookies(cookies));
  if (!user) return "NO_SESSION";
  const pending = await findPendingRemovalNotice(user.userId, db);
  if (!pending) return "NO_NOTICE";
  await markRemovalNoticed(pending.id, getClock().now(), db);
  await endSessionFromCookies(cookies);
  return "NOTICED";
}
