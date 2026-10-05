import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { requireSession } from "@/lib/auth/require-session";
import { PrefsProvider } from "@/lib/prefs";
import { resolveAppEntry } from "@/modules/familia/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const entry = await resolveAppEntry(user);
  if (!entry.membership) redirect(entry.redirectTo);
  const { membership } = entry;
  return (
    <Providers>
      <PrefsProvider userId={user.userId}>
        <AppShell
          user={{
            name: user.name ?? user.email.split("@")[0] ?? user.email,
            email: user.email,
            image: user.image,
          }}
          familyName={membership.familyName}
        >
          {children}
        </AppShell>
      </PrefsProvider>
    </Providers>
  );
}
