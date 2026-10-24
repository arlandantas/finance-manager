import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require-session";
import { getClock } from "@/lib/clock";
import { findActiveMembership } from "@/modules/familia/repo";
import { loadConsentView } from "@/modules/mcp/authorize";
import { mcpEnabled } from "@/modules/mcp/config";
import { isLoopbackHost } from "@/modules/mcp/redirect";
import { mcpDb } from "@/modules/mcp/repo";
import { ConsentForm } from "./consent-form";

// SDD-024 §4.3 / SDD-025 §4.1. Sem navegação do app. O pedido foi validado e gravado por /oauth/authorize.
export const dynamic = "force-dynamic";

const KNOWN_HOSTS = ["claude.ai", "chatgpt.com", "gemini.google.com", "antigravity.google"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <p className="text-center text-sm font-semibold text-brand-800 dark:text-emerald-300">
        Finance Manager
      </p>
      {children}
    </main>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <Shell>
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {text}
      </p>
    </Shell>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; error?: string }>;
}) {
  if (!mcpEnabled()) return Notice({ text: "O acesso por assistente ainda não está disponível." });
  const params = await searchParams;
  if (params.error || !params.request) {
    return Notice({
      text: "Não foi possível conectar: o aplicativo que pediu acesso não é reconhecido.",
    });
  }
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/oauth/consent?request=${params.request}`)}`,
    );
  }
  const db = mcpDb();
  const member = await findActiveMembership(user.userId, db);
  if (!member) return Notice({ text: "Você ainda não faz parte de uma família." });
  const family = await db.family.findUnique({
    where: { id: member.familyId },
    select: { assistantAccessEnabled: true },
  });
  if (!family?.assistantAccessEnabled) {
    return Notice({ text: "O Administrador bloqueou o acesso por assistente" });
  }
  const view = await loadConsentView(db, params.request, user.userId, getClock().now());
  if (!view) {
    return Notice({
      text: "Este pedido de conexão expirou. Volte ao seu assistente e tente de novo.",
    });
  }
  const host = new URL(view.redirectUri).hostname;
  const loopback = isLoopbackHost(host);
  return (
    <Shell>
      <ConsentForm
        requestId={view.requestId}
        clientName={view.clientName}
        redirectHost={view.redirectHost}
        redirectIsLoopback={loopback}
        knownHost={loopback || KNOWN_HOSTS.includes(host.toLowerCase())}
        wantsWrite={view.scopesRequested.includes("write")}
      />
    </Shell>
  );
}
