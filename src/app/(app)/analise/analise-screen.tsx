"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/http";
import { useAnalysis } from "@/modules/analise/hooks";
import { intervalLabel, monthLabel, shiftMonthKey } from "../extrato/filters";
import { AnaliseRows } from "./analise-rows";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function AnaliseScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const from = sp.get("from");
  const to = sp.get("to");
  const range = from && to && ISO.test(from) && ISO.test(to) ? { from, to } : null;
  const periodParam = sp.get("period");
  const period =
    !range && periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : undefined;
  const type = sp.get("type") === "INCOME" ? "INCOME" : "EXPENSE";
  const q = useAnalysis({ ...(range ?? {}), ...(period ? { period } : {}), type });
  const [custom, setCustom] = useState(Boolean(range));
  const [draft, setDraft] = useState({ from: range?.from ?? "", to: range?.to ?? "" });

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, ...next })) if (v) p.set(k, v);
    router.replace(`${pathname}?${p}`);
  };
  const key = q.data?.period.key;
  const monthKey = range ? null : (period ?? (key && !key.includes("..") ? key : null));
  const d = q.data;
  const errMsg =
    q.error instanceof ApiClientError && q.error.status === 400
      ? q.error.message
      : "Não foi possível carregar a análise";

  const total = (label: string, value: number | undefined, id: string) => (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-slate-500">{label}</p>
      <div data-testid={id} className="break-words text-sm font-semibold tabular-nums sm:text-base">
        {value === undefined ? <Skeleton className="h-5 w-20" /> : <Money cents={value} />}
      </div>
    </div>
  );

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Análise</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            hidden={custom}
            disabled={!monthKey}
            onClick={() => monthKey && go({ period: shiftMonthKey(monthKey, -1) })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span
            data-testid="period-label"
            className="min-w-36 text-center text-sm font-semibold text-slate-900"
          >
            {range ? intervalLabel(range.from, range.to) : monthKey ? monthLabel(monthKey) : "…"}
          </span>
          <button
            type="button"
            aria-label="Próximo mês"
            hidden={custom}
            disabled={!monthKey}
            onClick={() => monthKey && go({ period: shiftMonthKey(monthKey, 1) })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="secondary"
          aria-pressed={custom}
          onClick={() => {
            if (custom) go({});
            setCustom(!custom);
          }}
        >
          Intervalo livre
        </Button>
        {custom ? (
          <>
            <label className="flex flex-col text-xs text-slate-600">
              De
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-600">
              Até
              <input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            <Button
              disabled={!ISO.test(draft.from) || !ISO.test(draft.to)}
              onClick={() => go({ from: draft.from, to: draft.to })}
            >
              Aplicar
            </Button>
          </>
        ) : null}
      </div>

      <section
        aria-label="Totais do período"
        className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:bg-slate-100"
      >
        {total("Receitas", d?.totals.incomeInCents, "analysis-income")}
        {total("Despesas", d?.totals.expenseInCents, "analysis-expense")}
        {total("Resultado", d?.totals.resultInCents, "analysis-result")}
      </section>

      <div role="tablist" aria-label="Tipo" className="flex gap-2">
        {(["EXPENSE", "INCOME"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => go({ ...(range ?? {}), ...(period ? { period } : {}), type: t })}
            className={cn(
              "min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium",
              type === t
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-800",
            )}
          >
            {t === "EXPENSE" ? "Despesas" : "Receitas"}
          </button>
        ))}
      </div>

      {q.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">{errMsg}</p>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando análise">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : null}

      {d && d.rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:bg-slate-100">
          {d.isEmpty ? "Nada lançado neste período" : "Nada deste tipo neste período"}
        </p>
      ) : null}
      {d && d.rows.length > 0 ? <AnaliseRows rows={d.rows} type={d.type} /> : null}
    </main>
  );
}
