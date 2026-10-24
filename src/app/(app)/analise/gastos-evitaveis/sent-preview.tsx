"use client";

import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import type { AnalysisPayloadDTO, ReadableDTO } from "@/modules/analise-ia/dto";

const REL_LABEL = (rel: number) => (rel === 0 ? "mês analisado" : `${-rel} mês(es) antes`);

/**
 * "O que será enviado" / "O que foi enviado" (US-070 e US-073): lista legível dos agregados e o JSON exato.
 * Sem nomes de pessoas, de estabelecimentos nem dados de conta.
 */
export function SentPreview({
  summary,
  readable,
  payload,
  testId = "sent-preview",
}: {
  summary: string;
  readable: ReadableDTO;
  payload: AnalysisPayloadDTO | null;
  testId?: string;
}) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <p className="text-sm font-medium text-slate-900">{summary}</p>
      <section aria-label="Totais por categoria" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Totais por categoria</h3>
        <ul className="flex flex-col gap-1 text-sm text-slate-800">
          {readable.categories.map((c) => (
            <li key={c.label} className="flex flex-col gap-0.5 border-b border-slate-200 pb-1">
              <span className="font-medium">{c.label}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                {[...c.months]
                  .sort((a, b) => b.rel - a.rel)
                  .map((m) => (
                    <span key={m.rel}>
                      {REL_LABEL(m.rel)}: <Money cents={m.amountInCents} />
                    </span>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {readable.recurring.length > 0 ? (
        <section aria-label="Valores recorrentes" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Valores recorrentes</h3>
          <ul className="flex flex-col gap-1 text-sm text-slate-800">
            {readable.recurring.map((r) => (
              <li key={r.ref} className="flex justify-between gap-3">
                <span>{r.label}</span>
                <span className="text-slate-600">
                  <Money cents={r.monthlyAvgInCents} /> por mês · {r.months} meses
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {payload ? (
        <>
          <Button variant="ghost" onClick={() => setShowJson((v) => !v)} aria-expanded={showJson}>
            {showJson ? "Esconder o JSON exato" : "Ver o JSON exato"}
          </Button>
          {showJson ? (
            <pre
              data-testid="sent-json"
              className="max-h-72 overflow-auto rounded-lg bg-slate-100 p-2 text-xs text-slate-800"
            >
              {JSON.stringify(payload, null, 2)}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
