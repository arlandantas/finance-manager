import Link from "next/link";
import { redirect } from "next/navigation";
import { switchAccountAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/require-session";
import { getClock } from "@/lib/clock";
import { acceptPendingInvitation, previewInvitation } from "@/modules/familia/invitations/service";
import { LoginOptions } from "../../login-options";

export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-sm font-semibold text-brand-800">Finance Manager</p>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      </header>
      {children}
    </main>
  );
}

function HomeLink() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
    >
      Ir para o início
    </Link>
  );
}

/** SDD-003 §5.5: o link só contextualiza; o vínculo exige o e-mail verificado do convite. */
export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getCurrentUser();
  const clock = getClock();
  const preview = await previewInvitation(token, session ? { email: session.email } : null, clock);

  if (preview.state === "READY" && session) {
    const result = await acceptPendingInvitation(
      { id: session.userId, email: session.email, emailVerified: session.emailVerified },
      clock,
    );
    redirect(result.status === "JOINED" ? "/?joined=1" : "/");
  }

  switch (preview.state) {
    case "INVALID":
      return (
        <Shell title="Este convite não é mais válido.">
          <HomeLink />
        </Shell>
      );
    case "EXPIRED":
      return (
        <Shell title="Convite expirado. Peça um novo convite.">
          <HomeLink />
        </Shell>
      );
    case "ACCEPTED":
      return (
        <Shell title="Este convite já foi usado.">
          <HomeLink />
        </Shell>
      );
    case "NEEDS_LOGIN":
      return (
        <Shell title={`${preview.inviterName} convidou você para a ${preview.familyName}`}>
          <p className="text-center text-sm text-slate-600">
            Entre com a conta Google de <strong>{preview.email}</strong> para participar.
          </p>
          <LoginOptions callbackUrl={`/convite/${token}`} />
        </Shell>
      );
    case "WRONG_EMAIL":
      return (
        <Shell title="Este convite é para outro e-mail">
          <p className="text-center text-sm text-slate-600">
            O convite da {preview.familyName} foi enviado para outro endereço. Entre com a conta
            Google convidada para participar.
          </p>
          <form action={switchAccountAction}>
            <input type="hidden" name="callbackUrl" value={`/convite/${token}`} />
            <Button type="submit" className="w-full">
              Entrar com outra conta
            </Button>
          </form>
        </Shell>
      );
    default:
      return (
        <Shell title="Este convite não é mais válido.">
          <HomeLink />
        </Shell>
      );
  }
}
