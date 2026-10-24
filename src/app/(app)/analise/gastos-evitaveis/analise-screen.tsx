"use client";

import Link from "next/link";
import { RequestPanel } from "./request-panel";

/** Análise ▸ Gastos evitáveis (FLUXO-017). */
export function AnaliseScreen() {
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
      <RequestPanel />
    </main>
  );
}
