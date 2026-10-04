"use server";

import { signIn, signOut } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/redirect";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function signInWithGoogleAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(String(formData.get("callbackUrl") ?? "/"));
  await signIn("google", { redirectTo: callbackUrl });
}
