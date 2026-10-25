"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/** US-079: "Baixar meus dados" (GET /me/export). O arquivo nunca passa pelo "ocultar valores". */
async function downloadMyData(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/v1/me/export", { credentials: "same-origin" });
  } catch {
    throw new Error("Sem conexão. Tente de novo.");
  }
  if (!res.ok) {
    let message = "Erro inesperado. Tente novamente.";
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // corpo não é JSON: mantém a mensagem genérica
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
    "meus-dados.json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function PerfilScreen({ name, email }: { name: string; email: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = useRef(false);

  const onDownload = async () => {
    if (busy.current) return; // duplo clique: um download por intenção
    busy.current = true;
    setState({ kind: "busy" });
    try {
      await downloadMyData();
      setState({ kind: "done" });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Erro inesperado." });
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Perfil</h1>
        <p className="mt-1 text-sm text-slate-600" data-testid="perfil-identidade">
          {name} · {email}
        </p>
      </header>

      <section
        aria-labelledby="seus-dados"
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:bg-slate-100"
      >
        <h2 id="seus-dados" className="text-lg font-semibold text-slate-900">
          Seus dados
        </h2>
        <p className="text-sm text-slate-600">
          Uma cópia dos seus dados em formato aberto (JSON). O arquivo traz informações financeiras:
          guarde-o com cuidado.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            data-testid="baixar-meus-dados"
            onClick={onDownload}
            disabled={state.kind === "busy"}
            className="sm:w-auto"
          >
            <Download size={16} aria-hidden="true" />
            {state.kind === "busy" ? "Preparando…" : "Baixar meus dados"}
          </Button>
        </div>
        {state.kind === "done" ? (
          <p role="status" className="text-sm text-brand-800 dark:text-emerald-300">
            Arquivo gerado. Confira a pasta de downloads.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm text-red-800 dark:text-red-300">{state.message}</p>
            <Button variant="secondary" onClick={onDownload}>
              Tentar de novo
            </Button>
          </div>
        ) : null}
        <div className="mt-2 flex flex-col gap-1 border-t border-slate-200 pt-3">
          <p className="text-sm text-slate-600">
            Excluir a conta apaga seu nome, e-mail e foto e encerra todos os acessos. É definitivo.
          </p>
          <Link
            href="/perfil/excluir-conta"
            data-testid="excluir-minha-conta"
            className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-red-700 underline dark:text-red-300"
          >
            Excluir minha conta
          </Link>
        </div>
      </section>

      <p className="text-sm text-slate-600">
        <Link href="/" className="underline">
          Voltar ao início
        </Link>
      </p>
    </div>
  );
}
