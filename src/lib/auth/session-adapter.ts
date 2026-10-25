import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashSessionToken, isSessionExpired, SESSION_ABSOLUTE_SECONDS } from "@/lib/auth/session";

type Db = Pick<PrismaClient, "session">;

/**
 * SEC-018 (SDD-028 §6.1): sessão por HASH. O Auth.js continua falando em `sessionToken`, mas o banco só vê
 * `sha256(token)`; cada método devolve ao Auth.js o token ORIGINAL. A validade respeita ociosidade e prazo absoluto.
 */
export function hashedSessionAdapter(base: Adapter, db: Db): Adapter {
  const clampToAbsolute = (createdAt: Date, expires: Date) =>
    new Date(Math.min(expires.getTime(), createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000));
  return {
    ...base,
    createSession: async (s) => {
      const row = await db.session.create({
        data: { tokenHash: hashSessionToken(s.sessionToken), userId: s.userId, expires: s.expires },
      });
      return {
        sessionToken: s.sessionToken,
        userId: row.userId,
        expires: clampToAbsolute(row.createdAt, row.expires),
      };
    },
    getSessionAndUser: async (token) => {
      const row = await db.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      });
      if (!row) return null;
      if (isSessionExpired(row, new Date())) {
        await db.session.deleteMany({ where: { id: row.id } });
        return null;
      }
      if (row.endedAt) return null; // DEV-91: membro removido
      const { user, ...session } = row;
      return {
        session: { sessionToken: token, userId: session.userId, expires: session.expires },
        user,
      };
    },
    updateSession: async (s) => {
      const hash = hashSessionToken(s.sessionToken);
      const row = await db.session.findUnique({ where: { tokenHash: hash } });
      if (!row) return null;
      const expires = clampToAbsolute(row.createdAt, s.expires ?? row.expires);
      await db.session.update({ where: { id: row.id }, data: { expires } });
      return { sessionToken: s.sessionToken, userId: row.userId, expires };
    },
    deleteSession: async (token) => {
      await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    },
  };
}
