"use client";

import Link from "next/link";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/http";
import type { AnalysisClassDTO, SpendingAnalysisDTO } from "@/modules/analise-ia/dto";
import { useAnalysis } from "@/modules/analise-ia/hooks";
import { AvoidableCard } from "./avoidable-card";

const CLASS_LABEL: Record<AnalysisClassDTO, string> = {
  ESSENTIAL: "Essencial",
  IMPORTANT: "Importante",
  SUPERFLUOUS: "Supérfluo",
  UNCLASSIFIED: "Sem classificação",
};

const SP_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function delta(permille: number | null): string | null {
  if (permille === null) return null;
  const pct = (permille / 10).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${permille > 0 ? "+" : ""}${pct}% contra o mês anterior`;
}

/** Resultado da análise (FLUXO-017): resumo, margem para economizar, categorias por grupo. */
export function ResultScreen({ id }: { id: string }) {
  const q = useAnalysis(id);
  const a = q.data;

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/analise/gastos-evitaveis" className="text-sm text-brand-700 underline">
          Voltar para Gastos evitáveis
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Análise de {a ? a.period.label : "gastos"}
        </h1>
      </header>

      {q.isPending ? (
        <div aria-busy="true" aria-label="Carregando análise" className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {q.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">
            {q.error instanceof ApiClientError && q.error.status === 404
              ? "Análise não encontrada"
              : "Não foi possível carregar"}
          </p>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {a ? <ResultBody a={a} /> : null}
    </main>
  );
}

function ResultBody({ a }: { a: SpendingAnalysisDTO }) {
  return (
    <div data-testid="analysis-body" className="flex flex-col gap-5">
      <section aria-labelledby="summary-title" className="flex flex-col gap-2">
        <h2 id="summary-title" className="sr-only">
          Resumo
        </h2>
        <p
          data-testid="ai-badge"
          className="w-fit rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:text-emerald-300"
        >
          Gerada por IA: confira os números
        </p>
        <p data-testid="analysis-summary" className="text-base text-slate-900">
          {a.summary}
        </p>
        <p className="text-xs text-slate-600">
          Gerada em {SP_DATE.format(new Date(a.createdAt))}. Valores de{" "}
          {SP_DATE.format(new Date(a.createdAt))}
          {a.period.partial ? " (mês parcial)" : ""}.
        </p>
      </section>

      <section aria-labelledby="avoidable-title" className="flex flex-col gap-3">
        <h2 id="avoidable-title" className="text-lg font-semibold text-slate-900">
          Onde está a margem
        </h2>
        {a.avoidable.length === 0 ? (
          <p data-testid="no-avoidable" className="text-sm text-slate-700">
            Nenhum gasto apontado como evitável nesta análise.
          </p>
        ) : (
          a.avoidable.map((item) => <AvoidableCard key={item.key} item={item} />)
        )}
      </section>

      <section aria-labelledby="groups-title" className="flex flex-col gap-4">
        <h2 id="groups-title" className="text-lg font-semibold text-slate-900">
          Categorias por grupo
        </h2>
        {a.groups.map((g) => (
          <div
            key={g.class}
            data-testid="analysis-group"
            data-class={g.class}
            className="flex flex-col gap-2"
          >
            <h3 className="text-base font-semibold text-slate-900">{CLASS_LABEL[g.class]}</h3>
            <ul className="flex flex-col gap-2">
              {g.categories.map((c) => (
                <li
                  key={c.categoryId}
                  data-testid="analysis-category"
                  className="flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-slate-900">{c.label}</span>
                    <span className="font-medium text-slate-900">
                      <Money cents={c.amountInCents} />
                    </span>
                  </div>
                  {delta(c.deltaPermille) ? (
                    <p className="text-xs text-slate-600">{delta(c.deltaPermille)}</p>
                  ) : null}
                  <p className="text-sm text-slate-700">{c.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <p
        data-testid="analysis-disclaimer"
        className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
      >
        {a.disclaimer}
      </p>
    </div>
  );
}
