import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { consumeMembershipEnded } from "@/lib/auth/membership-ended";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/require-session";
import { LoginOptions } from "../login-options";
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
  // DEV-91: sessão encerrada por remoção da família mostra o aviso único (por aparelho) e some.
  const ended = params.error
    ? null
    : (await consumeMembershipEnded((await headers()).get("cookie"))) === "NOTICED";
  const errorMessage = loginErrorMessage(ended ? "MembershipEnded" : params.error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold text-brand-800 dark:text-emerald-300">Finance Manager</h1>
        <p className="text-slate-600">Suas finanças em família, sem briga</p>
      </header>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {errorMessage}
        </p>
      ) : null}

      <LoginOptions callbackUrl={callbackUrl} />

      <footer className="text-center text-sm">
        <Link href="/privacidade" className="text-slate-600 underline">
          Privacidade
        </Link>
      </footer>
    </main>
  );
}
