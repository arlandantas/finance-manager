"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useDecideProposal, useProposal } from "@/modules/mcp/proposal-hooks";
import type { ProposalDTO, ProposalStatus } from "@/modules/mcp/proposals-schemas";

const STATUS_TEXT: Record<Exclude<ProposalStatus, "PENDING">, string> = {
  CONFIRMED: "Proposta confirmada: o lançamento foi criado.",
  REJECTED: "Proposta recusada. Nada foi lançado.",
  EXPIRED: "A proposta expirou. Nada foi lançado. Peça ao assistente para propor de novo.",
};

const brDate = (iso: string) => iso.split("-").reverse().join("/");
const brTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

function errorText(e: unknown): string {
  return e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";
}

function Details({ p }: { p: ProposalDTO }) {
  return (
    <dl className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:bg-slate-100">
      <div>
        <dt className="text-slate-600">Descrição</dt>
        <dd data-testid="proposal-description" className="font-medium text-slate-900">
          {p.description}
        </dd>
      </div>
      <div>
        <dt className="text-slate-600">Valor</dt>
        <dd className="font-medium text-slate-900">
          <Money cents={p.amountInCents} />
        </dd>
      </div>
      <div>
        <dt className="text-slate-600">{p.source.kind === "card" ? "Cartão" : "Conta"}</dt>
        <dd className="text-slate-900">{p.source.name}</dd>
      </div>
      <div>
        <dt className="text-slate-600">Categoria</dt>
        <dd className="text-slate-900">{p.category.name}</dd>
      </div>
      <div>
        <dt className="text-slate-600">Data</dt>
        <dd className="text-slate-900">{brDate(p.occurredOn)}</dd>
      </div>
      <p className="text-xs text-slate-600">
        Despesa à vista, só sua · pedida por {p.assistantLabel}
      </p>
    </dl>
  );
}

/** Confirmar ou recusar uma proposta do assistente (US-076c). Nada vira lançamento antes do toque em "Confirmar". */
export function ProposalScreen({ id }: { id: string }) {
  const q = useProposal(id);
  const confirm = useDecideProposal(id, "confirm");
  const reject = useDecideProposal(id, "reject");
  const keys = useRef({ confirm: newIdempotencyKey(), reject: newIdempotencyKey() });
  const [error, setError] = useState<string | null>(null);
  const p = q.data?.proposal;
  const busy = confirm.isPending || reject.isPending;

  function decide(action: "confirm" | "reject") {
    setError(null);
    (action === "confirm" ? confirm : reject).mutate(keys.current[action], {
      onSuccess: () =>
        toast.success(action === "confirm" ? "Lançamento criado" : "Proposta recusada"),
      onError: (e) => {
        keys.current[action] = newIdempotencyKey();
        setError(errorText(e));
      },
    });
  }

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href="/configuracoes/assistente" className="text-sm text-brand-700 underline">
          Voltar para o Assistente de IA
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Proposta do assistente</h1>
      </header>

      {q.isPending ? (
        <div aria-busy="true" aria-label="Carregando proposta" className="flex flex-col gap-3">
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {q.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">
            {q.error instanceof ApiClientError && q.error.status === 404
              ? "Proposta não encontrada."
              : "Não foi possível carregar"}
          </p>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {p ? (
        <>
          <Details p={p} />
          {p.status === "PENDING" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-700">
                O assistente só propôs: nada foi lançado. Vale até {brTime(p.expiresAt)}.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <Button disabled={busy} onClick={() => decide("confirm")}>
                Confirmar lançamento
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => decide("reject")}>
                Recusar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p role="status" data-testid="proposal-status" className="text-sm text-slate-800">
                {STATUS_TEXT[p.status]}
              </p>
              {p.status === "CONFIRMED" && p.transactionId ? (
                <Link
                  href={`/extrato?highlight=${p.transactionId}`}
                  className="text-sm text-brand-700 underline"
                >
                  Ver no Extrato
                </Link>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
