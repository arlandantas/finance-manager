"use client";

import Link from "next/link";
import { Money } from "@/components/money";
import type { SpendingAnalysisDTO } from "@/modules/analise-ia/dto";

type Item = SpendingAnalysisDTO["avoidable"][number];

/** Cartão de possível gasto evitável: valor mensal e anual calculados pelo app (nunca pela IA). */
export function AvoidableCard({ item }: { item: Item }) {
  return (
    <article
      data-testid="avoidable-card"
      data-key={item.key}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <h3 className="font-semibold text-slate-900">{item.displayName}</h3>
      <p className="text-sm font-medium text-slate-900" data-testid="avoidable-values">
        <Money cents={item.monthlyInCents} /> por mês · <Money cents={item.annualInCents} /> por ano
      </p>
      <p className="text-sm text-slate-700">{item.reason}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={item.drillUrl}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline"
        >
          Ver lançamentos
        </Link>
      </div>
    </article>
  );
}
