import { getCurrentUser } from "@/lib/auth/require-session";
import { HomeScreen } from "./home-screen";

export const metadata = { title: "Início · Finance Manager" };

export default async function HomePage() {
  const user = await getCurrentUser();
  const firstName = (user?.name ?? "").split(" ")[0] ?? "";
  return <HomeScreen firstName={firstName} />;
}
