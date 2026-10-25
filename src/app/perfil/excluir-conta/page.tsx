import { requireSession } from "@/lib/auth/require-session";
import { findMembershipByUserId } from "@/modules/familia/repo";
import { ExcluirContaScreen } from "./excluir-conta-screen";

export const metadata = { title: "Excluir minha conta · Finance Manager" };
export const dynamic = "force-dynamic";

export default async function ExcluirContaPage() {
  const user = await requireSession();
  const membership = await findMembershipByUserId(user.userId);
  return (
    <ExcluirContaScreen
      email={user.email}
      memberId={membership?.memberId ?? null}
      familyName={membership?.familyName ?? null}
    />
  );
}
