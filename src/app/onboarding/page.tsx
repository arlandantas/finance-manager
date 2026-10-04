import { redirect } from "next/navigation";
import { Providers } from "@/components/providers";
import { requireSession } from "@/lib/auth/require-session";
import { resolveAppEntry } from "@/modules/familia/service";
import { suggestFamilyName } from "@/modules/familia/suggest-name";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

// SDD-003 §4.6: quem já tem família volta para a Home.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireSession();
  const entry = await resolveAppEntry(user);
  if (entry.membership) redirect("/");
  const { notice } = await searchParams;
  const displayName = user.name ?? user.email.split("@")[0] ?? user.email;
  return (
    <Providers>
      <OnboardingFlow
        userName={displayName}
        userImage={user.image}
        suggestedName={suggestFamilyName(user.name)}
        notice={notice === "invite_expired" ? "Convite expirado. Peça um novo convite." : null}
      />
    </Providers>
  );
}
