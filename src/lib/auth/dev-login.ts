import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/auth/email";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { randomToken } from "@/lib/ids";

export const localPart = (email: string) => email.split("@")[0] ?? email;

/** Reproduz o fim de um login OAuth: upsert do User + Session em banco (ADR-008 §1). */
export async function createDevSession(
  db: Pick<PrismaClient, "user" | "session">,
  input: { email: string; name?: string | undefined },
  now: Date = new Date(),
) {
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: {
          emailVerified: existing.emailVerified ?? now,
          ...(input.name ? { name: input.name } : {}),
        },
      })
    : await db.user.create({
        data: { email, emailVerified: now, name: input.name ?? localPart(email) },
      });
  const sessionToken = randomToken(32);
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.session.create({ data: { sessionToken, userId: user.id, expires } });
  return { user, sessionToken, expires };
}
