import { redirect } from "next/navigation";
import { signInWithGoogleAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { isGoogleConfigured } from "@/lib/auth/config";
import { isDevLoginEnabled } from "@/lib/auth/dev-login-guard";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/require-session";
import { getEnv } from "@/lib/env";
import { loginErrorMessage } from "./messages";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  if (await getCurrentUser()) redirect(callbackUrl);

  const devLogin = isDevLoginEnabled();
  const googleReady = isGoogleConfigured(getEnv());
  const errorMessage = loginErrorMessage(params.error);
  const DevLoginForm = devLogin ? (await import("./dev-login-form")).DevLoginForm : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold text-brand-800">Finance Manager</h1>
        <p className="text-slate-600">Suas finanças em família, sem briga</p>
      </header>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      <form action={signInWithGoogleAction} className="flex flex-col gap-2">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Button type="submit" variant="secondary" disabled={!googleReady} className="w-full">
          Entrar com o Google
        </Button>
        {!googleReady && devLogin ? (
          <p className="text-center text-xs text-slate-500">
            Google não configurado neste ambiente
          </p>
        ) : null}
      </form>

      <p className="text-center text-xs text-slate-500">Usamos apenas seu nome, e-mail e foto.</p>

      {DevLoginForm ? <DevLoginForm callbackUrl={callbackUrl} /> : null}
    </main>
  );
}
