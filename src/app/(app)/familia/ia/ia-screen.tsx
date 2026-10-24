"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiSettings } from "@/modules/ia/hooks";
import { ConsentSwitch } from "./consent-switch";
import { UsageBlock } from "./usage-block";

/** Configurações ▸ IA e privacidade (SDD-021 §6, SDD-022 §6). INVOICE_IMPORT não aparece até a R5. */
export function IaScreen() {
  const settings = useAiSettings();
  const data = settings.data;

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/familia" className="text-sm text-brand-700 underline">
          Voltar para Família
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">IA e privacidade</h1>
      </header>

      {settings.isPending ? (
        <div
          aria-busy="true"
          aria-label="Carregando IA e privacidade"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-24" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {settings.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => settings.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <section aria-labelledby="ai-features-title" className="flex flex-col gap-3">
            <h2 id="ai-features-title" className="text-lg font-semibold text-slate-900">
              Recursos da família
            </h2>
            {data.features
              .filter((f) => f.purpose === "SPENDING_ANALYSIS")
              .map((f) => (
                <ConsentSwitch
                  key={f.purpose}
                  feature={f}
                  canEdit={data.canEdit}
                  familyVersion={data.familyVersion}
                />
              ))}
          </section>
          {data.usage ? <UsageBlock usage={data.usage} /> : null}
        </>
      ) : null}
    </main>
  );
}
