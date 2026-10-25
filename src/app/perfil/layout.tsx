import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { requireSession } from "@/lib/auth/require-session";
import { PrefsProvider } from "@/lib/prefs";
import { findMembershipByUserId } from "@/modules/familia/repo";

export const dynamic = "force-dynamic";

/**
 * Perfil (SEC-017): serve a quem tem família (com o menu de sempre) e também a quem NÃO tem (ex-membro, conta
 * sem família), que precisa poder baixar os próprios dados e excluir a conta. Por isso fica fora do grupo `(app)`,
 * cujo layout manda quem não tem família para o onboarding.
 */
export default async function PerfilLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const membership = await findMembershipByUserId(user.userId);
  const shellUser = {
    name: user.name ?? user.email.split("@")[0] ?? user.email,
    email: user.email,
    image: user.image,
  };
  return (
    <Providers>
      <PrefsProvider userId={user.userId}>
        {membership ? (
          <AppShell
            user={shellUser}
            familyName={membership.familyName}
            settlementEnabled={membership.settlementEnabled}
          >
            {children}
          </AppShell>
        ) : (
          <main className="mx-auto w-full max-w-[960px] px-4 py-6">{children}</main>
        )}
      </PrefsProvider>
    </Providers>
  );
}
