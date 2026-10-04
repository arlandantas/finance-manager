"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { endSessionFromCookies } from "@/lib/auth/sign-out";

/**
 * Logout próprio (não usa `signOut` do Auth.js): o Auth.js monta a URL absoluta e escolhe o nome do cookie
 * por AUTH_URL (localhost), o que quebrava o logout atrás do túnel/proxy HTTPS.
 */
async function clearSession() {
  const jar = await cookies();
  const all = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]));
  await endSessionFromCookies(all);
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  jar.set(SECURE_SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
}

export async function signOutAction() {
  await clearSession();
  redirect("/login");
}

export async function signInWithGoogleAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? "/"));
  await signIn("google", { redirectTo: callbackUrl });
}

/** "Entrar com outra conta" (convite aberto com o e-mail errado): encerra a sessão e volta ao convite. */
export async function switchAccountAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? "/"));
  await clearSession();
  redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}
