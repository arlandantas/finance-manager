"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HistoryPanel } from "./history-panel";
import { RequestPanel } from "./request-panel";

const TABS = [
  { key: "analisar", label: "Analisar" },
  { key: "historico", label: "Histórico" },
] as const;

/** Análise ▸ Gastos evitáveis (FLUXO-017): pedido e histórico. */
export function AnaliseScreen() {
  const aba = useSearchParams().get("aba");
  const current = TABS.find((t) => t.key === aba)?.key ?? "analisar";
  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/familia" className="text-sm text-brand-700 underline">
          Voltar para Família
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Gastos evitáveis</h1>
        <p className="text-sm text-slate-700">
          Uma segunda opinião educativa sobre onde pode haver margem para economizar. Nada é
          alterado por conta própria.
        </p>
      </header>
      <nav aria-label="Seções da análise" className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "analisar" ? "/analise/gastos-evitaveis" : `?aba=${t.key}`}
            aria-current={current === t.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${
              current === t.key
                ? "bg-brand-700 text-white"
                : "border border-slate-300 text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {current === "analisar" ? <RequestPanel /> : <HistoryPanel />}
    </main>
  );
}
