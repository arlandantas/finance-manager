import type { PrismaClient } from "@/generated/prisma/client";
import { sha256Hex } from "@/lib/ids";

/** Cookies do Auth.js com sessão em banco (ADR-002/ADR-008). */
export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";
// SEC-018 (SDD-028 §6.2, D-GES-42 U2): ociosidade de 30 dias (renovação deslizante) e prazo absoluto de 90 dias
// desde o login. O uso diário não pede novo login; um novo login a cada 90 dias (RN-012.3).
export const SESSION_IDLE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 90;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
/** Duração do cookie: acompanha a ociosidade (o servidor reenvia o cookie ao renovar). */
export const SESSION_MAX_AGE_SECONDS = SESSION_IDLE_SECONDS;

/** O banco guarda só o hash; o cookie leva o token aleatório. */
export const hashSessionToken = (token: string) => sha256Hex(token);

/** Validade renovada: ociosidade a partir de agora, nunca além do prazo absoluto. */
export function slidingExpiry(createdAt: Date, now: Date): Date {
  return new Date(
    Math.min(
      now.getTime() + SESSION_IDLE_SECONDS * 1000,
      createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000,
    ),
  );
}

/** Sessão vencida por ociosidade (`expires`) ou pelo prazo absoluto (`createdAt`). */
export function isSessionExpired(s: { expires: Date; createdAt: Date }, now: Date): boolean {
  return (
    s.expires.getTime() <= now.getTime() ||
    s.createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000 <= now.getTime()
  );
}

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
 * Resolve a sessão em banco pelo HASH do token. Vencida (ociosidade ou prazo absoluto) => apaga a linha e `null`.
 * Renova a janela deslizante (nunca além do prazo absoluto) quando passou `updateAge` desde a última renovação.
 */
export async function findSessionUser(
  db: Pick<PrismaClient, "session">,
  token: string | null,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (isSessionExpired(session, now)) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const next = slidingExpiry(session.createdAt, now);
  if (next.getTime() - session.expires.getTime() >= SESSION_UPDATE_AGE_SECONDS * 1000) {
    await db.session.update({ where: { id: session.id }, data: { expires: next } });
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
  const res = await db.session.deleteMany({
    where: { tokenHash: { in: tokens.map(hashSessionToken) } },
  });
  return res.count;
}
