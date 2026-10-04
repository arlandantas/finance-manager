import { requireSession } from "@/lib/auth/require-session";

// Placeholder até a US-002 (onboarding de criação da família).
export default async function OnboardingPage() {
  await requireSession();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 p-6">
      <h1 className="text-2xl font-semibold">Crie sua família</h1>
    </main>
  );
}
