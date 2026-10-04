import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import {
  findSessionUser,
  parseCookieHeader,
  type SessionUser,
  sessionTokenFromCookies,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/** Sessão atual em componentes de servidor; `null` quando não autenticado. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const all = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]));
  return findSessionUser(getDb(), sessionTokenFromCookies(all));
}

/** Autoridade da sessão no servidor (SDD-003 §3.4); sem sessão => /login?callbackUrl=… */
export async function requireSession(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const h = await headers();
  const path = safeCallbackUrl(h.get("x-app-path"));
  redirect(path === "/" ? "/login" : `/login?callbackUrl=${encodeURIComponent(path)}`);
}

export { parseCookieHeader };
