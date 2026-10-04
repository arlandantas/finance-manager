import type { PrismaClient } from "@/generated/prisma/client";

/** Cookies do Auth.js com sessão em banco (ADR-002/ADR-008). */
export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // RN-012.3: 90 dias deslizantes
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export type SessionUser = {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
};

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name && !(name in out)) out[name] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionTokenFromCookies(cookies: Record<string, string>): string | null {
  return cookies[SECURE_SESSION_COOKIE] ?? cookies[SESSION_COOKIE] ?? null;
}

/**
 * Resolve a sessão em banco. Sessão expirada -> null. Aplica a janela deslizante do Auth.js:
 * a validade é renovada (now + 90 dias) quando passou `updateAge` desde a última renovação.
 */
export async function findSessionUser(
  db: Pick<PrismaClient, "session">,
  token: string | null,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!session || session.expires.getTime() <= now.getTime()) return null;
  const renewAfter =
    session.expires.getTime() - (SESSION_MAX_AGE_SECONDS - SESSION_UPDATE_AGE_SECONDS) * 1000;
  if (renewAfter <= now.getTime()) {
    await db.session.update({
      where: { id: session.id },
      data: { expires: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000) },
    });
  }
  const u = session.user;
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    emailVerified: u.emailVerified,
  };
}

/**
 * Encerra a sessão: remove do banco o(s) token(s) dos cookies (nome comum e `__Secure-`).
 * Independente do Auth.js, que só procura o cookie pelo esquema de AUTH_URL e falhava atrás de túnel/proxy.
 */
export async function endSession(
  db: Pick<PrismaClient, "session">,
  cookies: Record<string, string>,
): Promise<number> {
  const tokens = [cookies[SECURE_SESSION_COOKIE], cookies[SESSION_COOKIE]].filter(
    (t): t is string => Boolean(t),
  );
  if (tokens.length === 0) return 0;
  const res = await db.session.deleteMany({ where: { sessionToken: { in: tokens } } });
  return res.count;
}
