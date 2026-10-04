import { endSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

/** Remove do banco a sessão dos cookies informados (ver `endSession`). */
export const endSessionFromCookies = (cookies: Record<string, string>) =>
  endSession(getDb(), cookies);
