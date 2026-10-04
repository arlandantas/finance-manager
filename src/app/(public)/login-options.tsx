import { signInWithGoogleAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { isGoogleConfigured } from "@/lib/auth/config";
import { isDevLoginEnabled } from "@/lib/auth/dev-login-guard";
import { getEnv } from "@/lib/env";

/** Botão do Google (desabilitado sem credenciais, EXT-01) e bloco de login de teste (ADR-008). */
export async function LoginOptions({ callbackUrl }: { callbackUrl: string }) {
  const devLogin = isDevLoginEnabled();
  const googleReady = isGoogleConfigured(getEnv());
  const DevLoginForm = devLogin ? (await import("./login/dev-login-form")).DevLoginForm : null;
  return (
    <>
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
    </>
  );
}
