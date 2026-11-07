import Link from "next/link";
import { Money } from "@/components/money";
import type { AnalysisRowDTO } from "@/modules/analise/schemas";

/** 583 => "58,3%" (inteiros: a soma das participações é exata, sem ponto flutuante). */
export function permilleLabel(p: number | null): string {
  if (p === null) return "—";
  return `${Math.floor(p / 10)},${p % 10}%`;
}

export function AnaliseRows({
  rows,
  type,
}: {
  rows: AnalysisRowDTO[];
  type: "EXPENSE" | "INCOME";
}) {
  const bar = type === "EXPENSE" ? "bg-slate-700" : "bg-emerald-600";
  return (
    <ul className="flex flex-col gap-2" aria-label="Quebra por categoria">
      {rows.map((r) => (
        <li key={r.key} data-testid="analysis-row">
          <Link
            href={r.drillUrl}
            className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:bg-slate-100"
          >
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                {r.label}
                {r.archived ? <span className="text-xs text-slate-500"> (arquivada)</span> : null}
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                <Money cents={r.amountInCents} />
              </span>
              <span
                data-testid="analysis-share"
                className="w-14 text-right text-sm tabular-nums text-slate-600"
              >
                {permilleLabel(r.permille)}
              </span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
              <span
                data-testid="analysis-bar"
                className={`block h-full rounded-full ${bar}`}
                style={{ width: `${(r.permille ?? 0) / 10}%` }}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
