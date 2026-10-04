import { getCurrentUser } from "@/lib/auth/require-session";

export default async function HomePage() {
  const user = await getCurrentUser();
  const firstName = (user?.name ?? "").split(" ")[0] ?? "";
  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-slate-900">Olá, {firstName}</h1>
      <p className="text-slate-600">Bem-vindo ao Finance Manager.</p>
    </main>
  );
}
