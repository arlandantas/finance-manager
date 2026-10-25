"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useFamily } from "@/modules/familia/hooks";

const WILL_BE_DELETED = [
  "contas",
  "cartões",
  "categorias",
  "tags",
  "lançamentos",
  "previstas",
  "recorrentes",
  "acertos",
  "importações",
  "análises",
  "o histórico de alterações",
];

/**
 * US-081: excluir a família inteira. Só o Administrador que é a única pessoa ativa; confirma digitando o nome
 * atual. O servidor repete todas as checagens e apaga tudo numa transação.
 */
export function ExcluirFamiliaScreen() {
  const family = useFamily();
  const router = useRouter();
  const data = family.data;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const submitting = useRef(false);

  const isAdmin = data?.currentRole === "ADMIN";
  const others = data ? data.members.filter((m) => m.memberId !== data.currentMemberId).length : 0;
  const nameOk = data !== undefined && typed.trim() === data.family.name;

  const del = useMutation({
    networkMode: "always", // offline: tenta e falha com a mensagem, em vez de ficar pausado
    mutationFn: () =>
      apiFetch<{ deleted: true }>("/api/v1/family/delete", {
        method: "POST",
        idempotencyKey: keyRef.current,
        body: { confirmFamilyName: typed.trim() },
      }),
    onSuccess: (r) => {
      router.replace("/onboarding?deleted=1");
    },
    onError: (e) => {
      keyRef.current = newIdempotencyKey();
      submitting.current = false;
      if (e instanceof NetworkError) setError("Sem conexão. Nada foi excluído. Tente de novo.");
      else if (e instanceof ApiClientError) setError(e.message);
      else setError("Erro inesperado. Tente novamente.");
    },
  });

  const onDelete = () => {
    if (submitting.current || !nameOk || others > 0 || !isAdmin) return; // duplo clique: uma exclusão só
    submitting.current = true;
    setError(null);
    del.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Excluir família</h1>
        {data ? <p className="mt-1 text-sm text-slate-600">{data.family.name}</p> : null}
      </header>

      {family.isPending ? <p className="text-sm text-slate-600">Carregando…</p> : null}
      {family.isError ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          Não foi possível carregar. Recarregue a página.
        </p>
      ) : null}

      {data && !isAdmin ? (
        <p role="alert" className="text-sm text-slate-700">
          Só o Administrador pode excluir a família.
        </p>
      ) : null}

      {data && isAdmin && others > 0 ? (
        <div
          role="alert"
          data-testid="exclusao-bloqueada"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          Remova os outros membros antes de excluir a família.
        </div>
      ) : null}

      {data && isAdmin && others === 0 ? (
        <>
          <section
            aria-labelledby="vai-apagar"
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:bg-slate-100"
          >
            <h2 id="vai-apagar" className="text-lg font-semibold text-slate-900">
              O que será apagado
            </h2>
            <ul
              className="list-disc space-y-1 pl-5 text-sm text-slate-800"
              data-testid="lista-apagar"
            >
              {WILL_BE_DELETED.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Esta ação não pode ser desfeita
            </p>
            <p className="text-sm text-slate-700">
              Sua conta de usuário continua e você poderá criar uma nova família. Convites pendentes
              deixam de valer.
            </p>
            <p className="text-sm text-slate-700">
              <Link
                href="/perfil"
                className="font-semibold text-brand-800 underline dark:text-emerald-300"
              >
                Baixar meus dados antes
              </Link>
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <label htmlFor="confirm-family" className="text-sm font-medium text-slate-800">
              Digite o nome da família
            </label>
            <input
              id="confirm-family"
              autoComplete="off"
              className={inputClass}
              placeholder={data.family.name}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="danger"
                data-testid="excluir-familia"
                disabled={!nameOk || del.isPending}
                onClick={onDelete}
              >
                {del.isPending ? "Excluindo…" : "Excluir a família"}
              </Button>
              <Link
                href="/familia"
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
