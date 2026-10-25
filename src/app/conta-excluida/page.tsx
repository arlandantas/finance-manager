import Link from "next/link";

export const metadata = { title: "Conta excluída · Finance Manager" };

// US-080: página pública de despedida (a sessão já foi encerrada).
export default function ContaExcluidaPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Sua conta foi excluída</h1>
        <p className="text-slate-600">
          Seu nome, e-mail e foto foram apagados e todos os aparelhos foram desconectados. Entrar de
          novo com o mesmo Google cria uma conta nova e vazia.
        </p>
      </header>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
