"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAnalyses, useDeleteAllAnalyses, useDeleteAnalysis } from "@/modules/analise-ia/hooks";
import { DismissedList } from "./dismissed-list";

const SP_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const errorText = (e: unknown) =>
  e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";

/** Histórico das análises (US-073): ver, apagar uma, apagar todo o histórico. */
export function HistoryPanel() {
  const list = useAnalyses();
  const del = useDeleteAnalysis();
  const delAll = useDeleteAllAnalyses();
  const [asking, setAsking] = useState<
    { kind: "one"; id: string; label: string } | { kind: "all" } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const busy = del.isPending || delAll.isPending;

  function close() {
    setAsking(null);
    setError(null);
  }

  function confirm() {
    if (!asking || busy) return;
    setError(null);
    const done = (msg: string) => () => {
      keyRef.current = newIdempotencyKey();
      close();
      toast.success(msg);
    };
    const fail = (e: unknown) => {
      keyRef.current = newIdempotencyKey();
      setError(errorText(e));
    };
    if (asking.kind === "one") {
      del.mutate(
        { id: asking.id, idempotencyKey: keyRef.current },
        { onSuccess: done("Análise apagada"), onError: fail },
      );
    } else {
      delAll.mutate(
        { idempotencyKey: keyRef.current },
        { onSuccess: done("Histórico apagado"), onError: fail },
      );
    }
  }

  if (list.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando histórico" className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
        <Button variant="secondary" onClick={() => list.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const items = list.data.items;
  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 ? (
        <p
          data-testid="history-empty"
          className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:bg-slate-100"
        >
          Nenhuma análise no histórico.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Análises anteriores">
          {items.map((a) => (
            <li
              key={a.id}
              data-testid="history-row"
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
            >
              <div className="min-w-0">
                <Link
                  href={`/analise/gastos-evitaveis/${a.id}`}
                  className="font-medium text-brand-700 underline"
                >
                  {a.period.label}
                  {a.period.partial ? " (parcial)" : ""}
                </Link>
                <p className="text-xs text-slate-600">
                  Gerada em {SP_DATE.format(new Date(a.createdAt))} por{" "}
                  {a.requestedBy.name.split(" ")[0]}
                </p>
              </div>
              <Button
                variant="secondary"
                aria-label={`Apagar análise de ${a.period.label}`}
                onClick={() => setAsking({ kind: "one", id: a.id, label: a.period.label })}
              >
                Apagar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 ? (
        <Button variant="danger" onClick={() => setAsking({ kind: "all" })}>
          Apagar todo o histórico
        </Button>
      ) : null}
      <DismissedList />

      <Drawer
        open={asking !== null}
        onOpenChange={(o) => !o && close()}
        title={asking?.kind === "all" ? "Apagar todo o histórico?" : "Apagar esta análise?"}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-800">
            {asking?.kind === "all"
              ? "Todas as análises e o que foi enviado em cada uma serão apagados. As sugestões descartadas continuam salvas."
              : `A análise de ${asking?.kind === "one" ? asking.label : ""} e o que foi enviado nela serão apagados.`}{" "}
            Seus lançamentos não são afetados.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button variant="danger" disabled={busy} onClick={confirm}>
            Apagar
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
