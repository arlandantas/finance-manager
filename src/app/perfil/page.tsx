import { requireSession } from "@/lib/auth/require-session";
import { PerfilScreen } from "./perfil-screen";

export const metadata = { title: "Perfil · Finance Manager" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await requireSession();
  return (
    <PerfilScreen name={user.name ?? user.email.split("@")[0] ?? user.email} email={user.email} />
  );
}
