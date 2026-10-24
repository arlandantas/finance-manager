"use client";

import { Money } from "@/components/money";
import type { AiUsageDTO } from "@/modules/ia/dto";

function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** SDD-021 §6 "Consumo do mês": só para o Administrador (para o membro o bloco nem existe). */
export function UsageBlock({ usage }: { usage: AiUsageDTO }) {
  return (
    <section aria-labelledby="ai-usage-title" className="flex flex-col gap-3">
      <h2 id="ai-usage-title" className="text-lg font-semibold text-slate-900">
        Consumo do mês
      </h2>
      {usage.capInCents === null ? (
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
            <Money cents={usage.usedInCents} /> de <Money cents={usage.capInCents} /> usados neste
            mês
          </p>
          <div
            role="progressbar"
            aria-label="Consumo de IA do mês"
            aria-valuemin={0}
            aria-valuemax={usage.capInCents}
            aria-valuenow={Math.min(usage.usedInCents, usage.capInCents)}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className="h-full bg-brand-700"
              style={{
                width: `${usage.capInCents === 0 ? 100 : Math.min(100, Math.round((usage.usedInCents / usage.capInCents) * 100))}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-500">Volta a zerar em {brDate(usage.resetsOn)}</p>
        </div>
      )}
    </section>
  );
}
