"use client";

import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiUsage } from "@/modules/ia/hooks";

function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** SDD-021 §6 "Consumo do mês": só para o Administrador (para o membro o bloco nem existe). */
export function UsageBlock() {
  const usage = useAiUsage(true);

  return (
    <section aria-labelledby="ai-usage-title" className="flex flex-col gap-3">
      <h2 id="ai-usage-title" className="text-lg font-semibold text-slate-900">
        Consumo do mês
      </h2>
      {usage.isPending ? (
        <div aria-busy="true" aria-label="Carregando consumo">
          <Skeleton className="h-16" />
        </div>
      ) : null}
      {usage.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">
            Não foi possível carregar o consumo
          </p>
          <Button variant="secondary" onClick={() => usage.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {usage.data ? (
        usage.data.capInCents === null ? (
          <p
            data-testid="ai-unavailable"
            className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:bg-slate-100"
          >
            A IA ainda não está disponível neste app
          </p>
        ) : (
          <div
            data-testid="ai-usage"
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
          >
            <p className="font-medium text-slate-900">
              <Money cents={usage.data.usedInCents} /> de <Money cents={usage.data.capInCents} />{" "}
              usados neste mês
            </p>
            <div
              role="progressbar"
              aria-label="Consumo de IA do mês"
              aria-valuemin={0}
              aria-valuemax={usage.data.capInCents}
              aria-valuenow={Math.min(usage.data.usedInCents, usage.data.capInCents)}
              className="h-2 overflow-hidden rounded-full bg-slate-200"
            >
              <div
                className="h-full bg-brand-700"
                style={{
                  width: `${usage.data.capInCents === 0 ? 100 : Math.min(100, Math.round((usage.data.usedInCents / usage.data.capInCents) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500">Volta a zerar em {brDate(usage.data.resetsOn)}</p>
          </div>
        )
      ) : null}
    </section>
  );
}
