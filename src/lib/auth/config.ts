import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { normalizeEmail } from "@/lib/auth/email";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** Callback `signIn` (pura, sem rede): Google exige e-mail verificado antes de qualquer criação. */
export function authorizeSignIn(a: {
  provider?: string;
  profile?: { email?: string | null; email_verified?: boolean | null } | null;
}): true | string {
  if (a.provider === "google" && a.profile?.email_verified !== true) {
    return "/login?error=EmailNotVerified";
  }
  return true;
}

/** Envolve o adaptador Prisma para gravar/consultar e-mails sempre em minúsculas (SDD-003 §1). */
export function lowercaseEmailAdapter(base: Adapter): Adapter {
  return {
    ...base,
    createUser: (user) =>
      (base.createUser as NonNullable<Adapter["createUser"]>)({
        ...user,
        email: normalizeEmail(user.email),
      }),
    updateUser: (user) =>
      (base.updateUser as NonNullable<Adapter["updateUser"]>)({
        ...user,
        ...(user.email ? { email: normalizeEmail(user.email) } : {}),
      }),
    getUserByEmail: (email) =>
      (base.getUserByEmail as NonNullable<Adapter["getUserByEmail"]>)(normalizeEmail(email)),
  };
}

/** Atualizações de nome/foto vindas do Google a cada login (SDD-003 §3.1). */
export function profileUpdates(
  user: { name?: string | null; image?: string | null },
  profile: { name?: string | null; picture?: string | null; image?: string | null } | undefined,
): { name?: string; image?: string } {
  const out: { name?: string; image?: string } = {};
  const name = profile?.name ?? undefined;
  const image = profile?.picture ?? profile?.image ?? undefined;
  if (name && name !== user.name) out.name = name;
  if (image && image !== user.image) out.image = image;
  return out;
}

export function isGoogleConfigured(
  env: { AUTH_GOOGLE_ID?: string; AUTH_GOOGLE_SECRET?: string } = getEnv(),
) {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

export const sessionConfig = {
  strategy: "database",
  maxAge: SESSION_MAX_AGE_SECONDS,
  updateAge: SESSION_UPDATE_AGE_SECONDS,
} as const;

export function buildAuthConfig(): NextAuthConfig {
  const env = getEnv();
  const db = getDb();
  return {
    adapter: lowercaseEmailAdapter(PrismaAdapter(db as never)),
    session: sessionConfig,
    secret: env.AUTH_SECRET,
    providers: isGoogleConfigured(env)
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
            allowDangerousEmailAccountLinking: true, // seguro: exigimos email_verified (callback signIn)
          }),
        ]
      : [],
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      signIn: ({ account, profile }) => authorizeSignIn({ provider: account?.provider, profile }),
      session: ({ session, user }) => ({ ...session, user: { ...session.user, id: user.id } }),
    },
    events: {
      async signIn({ user, profile }) {
        if (!user?.id) return;
        const changes = profileUpdates(user, profile as never);
        if (Object.keys(changes).length > 0)
          await db.user.update({ where: { id: user.id }, data: changes });
      },
    },
    trustHost: env.AUTH_TRUST_HOST,
  };
}
