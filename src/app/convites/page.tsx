import { redirect } from "next/navigation";
import { Providers } from "@/components/providers";
import { requireSession } from "@/lib/auth/require-session";
import { getClock } from "@/lib/clock";
import { invitationGateState } from "@/modules/familia/invitations/service";
import { findMembershipByUserId } from "@/modules/familia/repo";
import { InvitationsScreen } from "./invitations-screen";

export const dynamic = "force-dynamic";

// SEC-004 (SDD-028 §1.4): tela de aceite. Quem já tem família volta para a Home; sem convite válido, onboarding.
export default async function ConvitesPage() {
  const user = await requireSession();
  if (await findMembershipByUserId(user.userId)) redirect("/");
  const invites = await invitationGateState(user, getClock());
  if (invites.valid === 0) redirect("/onboarding");
  return (
    <Providers>
      <InvitationsScreen />
    </Providers>
  );
}
