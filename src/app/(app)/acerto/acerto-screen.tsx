"use client";

import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { monthLabel, shiftMonthKey } from "@/app/(app)/extrato/filters";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money";
import { heroText } from "@/modules/split/hero";
import { useSettlement, useSplitRule } from "@/modules/split/hooks";
import { formatBpsList } from "@/modules/split/rules";
import type { SettlementDTO, SettlementSuggestion, SplitRuleDTO } from "@/modules/split/schemas";
import { SettleDrawer } from "./settle-drawer";

const firstName = (name: string) => name.split(" ")[0] ?? name;

function signed(cents: number): string {
  return cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
}

function MonthSelector({ period, isCurrent }: { period: string; isCurrent: boolean }) {
  const router = useRouter();
  const go = (key: string) => router.replace(`/acerto?period=${key}`, { scroll: false });
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Período">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => go(shiftMonthKey(period, -1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span
        data-testid="period-label"
        className="min-w-36 text-center text-sm font-semibold text-slate-900"
      >
        {monthLabel(period)}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        disabled={isCurrent}
        onClick={() => go(shiftMonthKey(period, 1))}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function Hero({ s, onSettle }: { s: SettlementDTO; onSettle: (x: SettlementSuggestion) => void }) {
  const hero = heroText(s);
  const ok = s.status === "BALANCED" || s.status === "SETTLED";
  return (
    <section
      aria-label="Resultado do acerto"
      data-testid="settlement-hero"
      data-status={s.status}
      className={cn(
        "flex flex-col gap-2 rounded-2xl p-5",
        ok ? "bg-emerald-50 text-emerald-900" : "bg-brand-800 text-white",
        (s.status === "EMPTY" || s.status === "NEEDS_MORE_MEMBERS") &&
          "bg-white text-slate-900 ring-1 ring-slate-200",
      )}
    >
      <p className="text-2xl font-bold leading-tight sm:text-3xl">{hero.title}</p>
      {hero.detail ? <p className="text-sm opacity-90">{hero.detail}</p> : null}
      {s.status === "NEEDS_MORE_MEMBERS" ? (
        <Link
          href="/familia"
          className="mt-1 inline-flex min-h-11 w-fit items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Convidar membro
        </Link>
      ) : null}
      {s.status === "PENDING" && s.suggestions[0] ? (
        <Button
          variant="secondary"
          className="mt-1 w-fit"
          onClick={() => onSettle(s.suggestions[0] as SettlementSuggestion)}
        >
          Registrar acerto
        </Button>
      ) : null}
      {s.status === "PENDING" && s.suggestions.length > 1 ? (
        <ul data-testid="settlement-suggestions" className="mt-1 flex flex-col gap-1 text-sm">
          {s.suggestions.slice(1).map((x) => (
            <li key={`${x.from.id}-${x.to.id}`} className="flex flex-wrap items-center gap-2">
              {firstName(x.from.name)} deve {formatBRL(x.amountInCents)} para {firstName(x.to.name)}
              <button
                type="button"
                onClick={() => onSettle(x)}
                className="min-h-11 rounded-lg px-2 font-semibold underline"
              >
                Registrar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MemberCard({
  row,
  showRemaining,
}: {
  row: SettlementDTO["members"][number];
  showRemaining: boolean;
}) {
  const cell = (label: string, value: string, tone = "text-slate-900", testid?: string) => (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        data-testid={testid}
        className={cn("break-words text-base font-semibold tabular-nums", tone)}
      >
        {value}
      </dd>
    </div>
  );
  return (
    <li
      data-testid="member-card"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={row.member.name} image={row.member.image} size={36} />
        <p className="font-semibold text-slate-900">{firstName(row.member.name)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {cell("Pagou", formatBRL(row.paidInCents), undefined, "paid")}
        {cell("Cota devida", formatBRL(row.quotaInCents), undefined, "quota")}
        {cell(
          "Diferença",
          signed(row.differenceInCents),
          row.differenceInCents > 0
            ? "text-emerald-700"
            : row.differenceInCents < 0
              ? "text-red-700"
              : "text-slate-900",
          "difference",
        )}
        {showRemaining
          ? cell("Saldo restante", signed(row.balanceInCents), undefined, "remaining")
          : null}
      </dl>
    </li>
  );
}

function RuleSummary({ rule }: { rule: SplitRuleDTO | undefined }) {
  if (!rule) return null;
  const text =
    rule.current.kind === "EQUAL"
      ? `Divisão igual (${formatBpsList(rule.current.shares)})`
      : `Divisão proporcional (${formatBpsList(rule.current.shares)})`;
  return (
    <p data-testid="rule-summary" className="text-sm text-slate-600">
      {text}
    </p>
  );
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando acerto" className="flex flex-col gap-4">
      <Skeleton className="h-28" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

export function AcertoScreen() {
  const sp = useSearchParams();
  const raw = sp.get("period");
  const period = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : undefined;
  const settlement = useSettlement(period);
  const rule = useSplitRule();
  const s = settlement.data;
  const hasAdjustments = s ? s.settlements.length > 0 : false;
  const [settling, setSettling] = useState<SettlementSuggestion | null>(null);

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Acerto de contas</h1>
        <div className="flex items-center gap-1">
          {s ? <MonthSelector period={s.period.key} isCurrent={s.period.isCurrent} /> : null}
          <Link
            href="/acerto/regra"
            aria-label="Regra de divisão"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {settlement.isPending ? <PanelSkeleton /> : null}

      {settlement.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => settlement.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {s ? (
        <>
          {s.rule.stale ? (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Regra de divisão desatualizada.{" "}
              {s.rule.canEdit ? (
                <Link href="/acerto/regra" className="font-semibold underline">
                  Redefinir percentuais
                </Link>
              ) : (
                "Peça a um Administrador para redefinir os percentuais."
              )}
            </p>
          ) : null}

          <Hero s={s} onSettle={setSettling} />

          {s.status !== "NEEDS_MORE_MEMBERS" ? (
            <>
              <p data-testid="settlement-total" className="text-sm text-slate-700">
                Total de despesas comuns: <strong>{formatBRL(s.totalSharedInCents)}</strong>
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {s.members.map((m) => (
                  <MemberCard key={m.member.id} row={m} showRemaining={hasAdjustments} />
                ))}
              </ul>
              <RuleSummary rule={rule.data} />
              {s.settlements.length > 0 ? (
                <section aria-label="Histórico de acertos" className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Acertos registrados</h2>
                  <ul className="flex flex-col gap-2">
                    {s.settlements.map((x) => (
                      <li
                        key={x.groupId}
                        data-testid="settlement-entry"
                        className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                      >
                        <p className="font-medium">
                          {firstName(x.from.name)} transferiu {formatBRL(x.amountInCents)} para{" "}
                          {firstName(x.to.name)} em{" "}
                          {x.occurredOn.split("-").reverse().slice(0, 2).join("/")}
                        </p>
                        <p className="text-slate-500">
                          {x.fromAccount.name} → {x.toAccount.name}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <p className="text-sm text-slate-500">Despesas pessoais não entram na divisão.</p>
            </>
          ) : null}
        </>
      ) : null}
      <SettleDrawer
        period={s?.period.key ?? ""}
        suggestion={settling}
        onClose={() => setSettling(null)}
      />
    </main>
  );
}
