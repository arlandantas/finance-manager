import type { PrismaClient } from "@/generated/prisma/client";
import { localPart } from "@/lib/auth/dev-login-guard";
import { normalizeEmail } from "@/lib/auth/email";
import { hashSessionToken, SESSION_IDLE_SECONDS } from "@/lib/auth/session";
import { randomToken } from "@/lib/ids";

/** Reproduz o fim de um login OAuth: upsert do User + Session em banco (ADR-008 §1). */
/** SEC-030: o login de teste não reaproveita uma conta excluída (anonimizada). */
export class DeletedAccountError extends Error {
  constructor() {
    super("Conta excluída.");
    this.name = "DeletedAccountError";
  }
}

export async function createDevSession(
  db: Pick<PrismaClient, "user" | "session">,
  input: { email: string; name?: string | undefined },
  now: Date = new Date(),
) {
  const email = normalizeEmail(input.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.deletedAt) throw new DeletedAccountError();
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
  const expires = new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000);
  await db.session.create({
    data: { tokenHash: hashSessionToken(sessionToken), userId: user.id, expires, createdAt: now },
  });
  return { user, sessionToken, expires };
}
