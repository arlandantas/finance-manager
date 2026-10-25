import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { normalizeEmail } from "@/lib/auth/email";
import { SESSION_IDLE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/auth/session";
import { hashedSessionAdapter, noProviderTokensAdapter } from "@/lib/auth/session-adapter";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** U6: lista de e-mails que podem criar conta (normalizados); vazia = cadastro aberto. */
export function parseAllowedSignupEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
}

/**
 * Callback `signIn` (pura, sem rede): Google exige e-mail verificado antes de qualquer criação e, com
 * `ALLOWED_SIGNUP_EMAILS` definida, só e-mails da lista CRIAM conta. Conta já existente continua entrando.
 */
export function authorizeSignIn(a: {
  provider?: string;
  profile?: { email?: string | null; email_verified?: boolean | null } | null;
  /** O e-mail já tem usuário no banco (conta existente não é barrada pela lista). */
  existingUser?: boolean;
  allowedSignupEmails?: readonly string[];
}): true | string {
  if (a.provider === "google" && a.profile?.email_verified !== true) {
    return "/login?error=EmailNotVerified";
  }
  const allowed = a.allowedSignupEmails ?? [];
  if (
    a.provider === "google" &&
    allowed.length > 0 &&
    !a.existingUser &&
    !allowed.includes(normalizeEmail(a.profile?.email ?? ""))
  ) {
    return "/login?error=SignupRestricted";
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

/**
 * Corpo devolvido por /api/auth/session (ADR-026 §6). Com strategy "database" o `session` recebido é a linha
 * do adaptador (traz `sessionToken` e `userId`): devolvemos só o necessário, nunca o token.
 */
export function buildSessionPayload(
  session: { expires: Date | string },
  user: { id: string; name?: string | null; email?: string | null; image?: string | null },
) {
  return {
    expires: session.expires as never,
    user: {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? "",
      image: user.image ?? null,
    },
  };
}

export const sessionConfig = {
  strategy: "database",
  maxAge: SESSION_IDLE_SECONDS,
  updateAge: SESSION_UPDATE_AGE_SECONDS,
} as const;

export function buildAuthConfig(): NextAuthConfig {
  const env = getEnv();
  const db = getDb();
  return {
    adapter: noProviderTokensAdapter(
      hashedSessionAdapter(lowercaseEmailAdapter(PrismaAdapter(db as never)), db),
    ),
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
      signIn: async ({ account, profile }) => {
        const email = profile?.email ? normalizeEmail(profile.email) : null;
        const allowedSignupEmails = parseAllowedSignupEmails(env.ALLOWED_SIGNUP_EMAILS);
        const existingUser =
          allowedSignupEmails.length > 0 && email
            ? (await db.user.findUnique({ where: { email }, select: { id: true } })) !== null
            : false;
        return authorizeSignIn({
          provider: account?.provider,
          profile,
          existingUser,
          allowedSignupEmails,
        });
      },
      session: ({ session, user }) => buildSessionPayload(session, user),
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
