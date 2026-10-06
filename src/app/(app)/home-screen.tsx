"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { monthLabel, shiftMonthKey } from "@/app/(app)/extrato/filters";
import { Money, useMoneyText } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { usePref } from "@/lib/prefs";
import { SUMMARY_COPY } from "@/modules/home/copy";
import { useHome, useMonthSummary } from "@/modules/home/hooks";
import type { HomeDTO, MonthSummaryDTO } from "@/modules/home/schemas";
import { SPLIT_COPY } from "@/modules/split/copy";
import { LedgerRow } from "./extrato/ledger-row";
import { TransactionDetailDrawer } from "./extrato/transaction-detail-drawer";
import { PayPlannedDrawer } from "./previstas/pay-drawer";

const first = (n: string) => n.split(" ")[0] ?? n;

function Card({
  title,
  testid,
  children,
  className,
}: {
  title: string;
  testid?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testid}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white dark:bg-slate-100 p-4",
        className,
      )}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Checklist({ o }: { o: HomeDTO["onboarding"] }) {
  const steps = [
    { done: o.hasAccount, label: "Cadastre uma conta", href: "/contas" },
    { done: o.hasOtherMember, label: "Convide quem divide as contas", href: "/familia" },
    { done: o.hasTransaction, label: "Faça seu primeiro lançamento", href: "/extrato" },
  ];
  return (
    <Card title="Primeiros passos" testid="home-checklist" className="bg-brand-50">
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-slate-900 hover:bg-(--surface-hover-brand) hover:text-(--text-on-hover)"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  s.done
                    ? "bg-emerald-600 text-white"
                    : "bg-white dark:bg-slate-100 text-brand-800 dark:text-emerald-300 ring-1 ring-brand-700",
                )}
              >
                {s.done ? <Check size={16} /> : i + 1}
              </span>
              <span className={cn("font-medium", s.done && "text-slate-500 line-through")}>
                {i + 1}. {s.label}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function SettlementLines({ ind }: { ind: NonNullable<HomeDTO["settlementIndicator"]> }) {
  if (!ind.current && !ind.previous) return null;
  const link =
    "flex min-h-11 items-center justify-between gap-2 text-sm text-slate-700 hover:underline";
  return (
    <div
      className="flex flex-col border-t border-slate-100 pt-1"
      data-testid="home-settlement-lines"
    >
      {ind.current ? (
        <Link
          href={`/acerto?period=${ind.current.periodKey}`}
          data-testid="home-settlement"
          className={link}
        >
          <span>
            {ind.current.state === "PENDING" ? (
              <>
                Acerto do mês: <Money cents={ind.current.toSettleInCents} /> a acertar
              </>
            ) : (
              SPLIT_COPY.indicatorInOrder
            )}
          </span>
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      ) : null}
      {ind.previous ? (
        <Link
          href={`/acerto?period=${ind.previous.oldestPeriodKey}`}
          data-testid="home-settlement-previous"
          className={link}
        >
          <span>
            Acertos pendentes de meses anteriores: {ind.previous.monthsCount}{" "}
            {ind.previous.monthsCount === 1 ? "mês" : "meses"} (
            <Money cents={ind.previous.totalInCents} />)
          </span>
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      ) : null}
    </div>
  );
}

function Line({
  label,
  testid,
  children,
  strong,
  tone,
}: {
  label: string;
  testid: string;
  children: React.ReactNode;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={cn("text-sm text-slate-600", strong && "font-semibold text-slate-900")}>
        {label}
      </dt>
      <dd
        data-testid={testid}
        className={cn(
          "tabular-nums font-semibold",
          strong ? "text-xl" : "text-base",
          tone ?? "text-slate-900",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function MonthSummaryCard({
  s,
  onShift,
  canNext,
  indicator,
}: {
  s: MonthSummaryDTO;
  indicator: HomeDTO["settlementIndicator"];
  onShift: (delta: number) => void;
  canNext: boolean;
}) {
  const maskText = useMoneyText();
  const negative = s.projectedBalanceInCents < 0;
  return (
    <section
      aria-label="Resumo do mês"
      data-testid="home-summary"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Resumo do mês
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => onShift(-1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span data-testid="home-period" className="min-w-32 text-center text-sm font-semibold">
            {monthLabel(s.period.key)}
          </span>
          <button
            type="button"
            aria-label="Próximo mês"
            disabled={!canNext}
            onClick={() => onShift(1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {s.isEmpty ? (
        <p data-testid="home-summary-empty" className="text-sm text-slate-600">
          {SUMMARY_COPY.empty}
        </p>
      ) : null}

      <dl className="flex flex-col divide-y divide-slate-100">
        <Line label="Receitas" testid="home-income" tone="text-emerald-700 dark:text-emerald-300">
          <Money cents={s.incomeInCents} />
        </Line>
        <Line label="Despesas" testid="home-expense">
          <Money cents={s.expenseInCents} />
        </Line>
        <Line
          label="Resultado do mês"
          testid="home-result"
          strong
          tone={s.resultInCents < 0 ? "text-red-700 dark:text-red-300" : "text-slate-900"}
        >
          <Money cents={s.resultInCents} />
        </Line>
        <div className="py-1">
          <Line label="A pagar" testid="home-topay">
            <Money cents={s.toPay.totalInCents} />
          </Line>
          <ul className="mb-1 ml-3 flex flex-col text-sm text-slate-600">
            <li className="flex justify-between gap-3" data-testid="home-topay-planned">
              <span>Previstas</span>
              <Money cents={s.toPay.plannedInCents} />
            </li>
            <li className="flex justify-between gap-3" data-testid="home-topay-invoices">
              <span>Faturas</span>
              <Money cents={s.toPay.invoicesInCents} />
            </li>
            {s.toPay.overdueCount > 0 ? (
              <li
                className="flex items-center justify-between gap-3"
                data-testid="home-topay-overdue"
              >
                <span>
                  <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:text-red-300">
                    {SUMMARY_COPY.overdue}
                  </span>
                  {s.toPay.overdueCount} {s.toPay.overdueCount === 1 ? "atrasada" : "atrasadas"}
                </span>
                <Money cents={s.toPay.overdueInCents} />
              </li>
            ) : null}
          </ul>
        </div>
        <div className="py-1">
          <Line
            label="Saldo previsto"
            testid="home-projected"
            strong
            tone={negative ? "text-red-700 dark:text-red-300" : "text-slate-900"}
          >
            <Money cents={s.projectedBalanceInCents} />
          </Line>
          <p className="text-xs text-slate-500">{SUMMARY_COPY.projectedHint}</p>
          {negative ? (
            <p
              role="status"
              data-testid="home-projected-warning"
              className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-sm font-medium text-red-800 dark:text-red-300"
            >
              {maskText(SUMMARY_COPY.projectedNegative)}
            </p>
          ) : null}
        </div>
      </dl>
      {indicator && s.period.isCurrent ? <SettlementLines ind={indicator} /> : null}
      <Link
        href="/previstas"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 dark:text-emerald-300 underline"
      >
        Ver contas a pagar
      </Link>
    </section>
  );
}

function BalancesCard({ b }: { b: HomeDTO["balances"] }) {
  const [expanded, setExpanded] = usePref("balancesExpanded");
  return (
    <section
      aria-label="Saldos das contas"
      data-testid="home-balance"
      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <button
        type="button"
        data-testid="balances-toggle"
        aria-expanded={expanded}
        aria-controls="home-balances-list"
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Saldos das contas
          </span>
          <span data-testid="family-balance" className="text-sm text-slate-600">
            Saldo da família:{" "}
            <span
              data-testid="family-balance-value"
              className={cn(
                "text-xl font-bold tabular-nums",
                b.totalInCents < 0 ? "text-red-700 dark:text-red-300" : "text-slate-900",
              )}
            >
              <Money cents={b.totalInCents} />
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          size={20}
          className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>
      <div id="home-balances-list" hidden={!expanded}>
        {expanded ? (
          b.accounts.length > 0 ? (
            <>
              <ul className="flex flex-col divide-y divide-slate-100">
                {b.accounts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href="/contas"
                      data-testid="home-account"
                      className="flex min-h-11 items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-800">{a.name}</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          a.balanceInCents < 0
                            ? "text-red-700 dark:text-red-300"
                            : "text-slate-900",
                        )}
                      >
                        <Money cents={a.balanceInCents} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/contas"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 dark:text-emerald-300 underline"
              >
                Cadastrar conta
              </Link>
            </>
          ) : null
        ) : null}
      </div>
      {b.accounts.length === 0 ? (
        <div className="flex flex-col items-start gap-1">
          <p className="text-sm text-slate-600">Nenhuma conta cadastrada</p>
          <Link
            href="/contas"
            className="text-sm font-semibold text-brand-800 dark:text-emerald-300 underline"
          >
            Cadastrar conta
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando início" className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-80" />
      <Skeleton className="h-24" />
      <Skeleton className="h-16" />
      <Skeleton className="h-72" />
    </div>
  );
}

export function HomeScreen({ firstName }: { firstName: string }) {
  const home = useHome();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // Detalhe por estado local, reabrível por `?tx=<id>` (sem rotas paralelas, SDD-010 §4.6)
  const detailId = search.get("tx");
  const openDetail = (id: string) => router.push(`${pathname}?tx=${id}`, { scroll: false });
  const closeDetail = () => router.replace(pathname, { scroll: false });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const h = home.data;
  const currentKey = h?.monthSummary.period.key;
  const viewing = period !== undefined && period !== currentKey;
  const other = useMonthSummary(period, viewing);
  const summary: MonthSummaryDTO | undefined = viewing ? other.data : h?.monthSummary;
  const shift = (delta: number) => {
    const base = period ?? currentKey;
    if (base) setPeriod(shiftMonthKey(base, delta));
  };
  const canNext =
    currentKey !== undefined && (period ?? currentKey) < shiftMonthKey(currentKey, 12);
  const summaryError = home.isError || (viewing && other.isError);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Olá, {firstName}</h1>

      {home.isPending ? <HomeSkeleton /> : null}
      {summaryError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">{SUMMARY_COPY.loadError}</p>
          <Button
            variant="secondary"
            onClick={() => (home.isError ? home.refetch() : other.refetch())}
          >
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {h ? (
        <div className="grid gap-4 md:grid-cols-2">
          {h.onboarding.showChecklist ? (
            <div className="md:col-span-2">
              <Checklist o={h.onboarding} />
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            {summary ? (
              <MonthSummaryCard
                s={summary}
                onShift={shift}
                canNext={canNext}
                indicator={h.settlementIndicator}
              />
            ) : viewing && other.isPending ? (
              <Skeleton className="h-80" />
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            {summary && summary.byMember.length > 0 ? (
              <Card title="Participação por membro" testid="home-participation">
                <ul className="flex flex-col gap-1">
                  {summary.byMember.map((m) => (
                    <li
                      key={m.member.id}
                      data-testid="home-member-share"
                      className="flex items-center gap-2 text-sm text-slate-800"
                    >
                      {first(m.member.name)} <Money cents={m.paidInCents} /> ({m.sharePercent}%)
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <BalancesCard b={h.balances} />
          </div>

          {summary && summary.toPay.items.length > 0 ? (
            <Card title="A pagar" testid="home-payables" className="md:col-span-2">
              <ul className="flex flex-col divide-y divide-slate-100">
                {summary.toPay.items.map((p) => (
                  <li
                    key={`${p.type}-${p.id}`}
                    data-testid="home-payable"
                    className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{p.title}</span>
                      <span className="text-slate-600">
                        {p.isOverdue ? (
                          <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:text-red-300">
                            Atrasada
                          </span>
                        ) : null}
                        vence {p.dueOn.slice(8, 10)}/{p.dueOn.slice(5, 7)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums text-slate-900">
                        <Money cents={p.amountInCents} />
                      </span>
                      {p.type === "INVOICE" ? (
                        <>
                          <Link
                            href={p.href}
                            className="font-medium text-brand-800 dark:text-emerald-300 underline"
                          >
                            Ver fatura
                          </Link>
                          <Link
                            href={`${p.href}&pay=1`}
                            className="font-medium text-brand-800 dark:text-emerald-300 underline"
                          >
                            Pagar fatura
                          </Link>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          aria-label={`Dar baixa em ${p.title}`}
                          onClick={() => setPayingId(p.id)}
                        >
                          Dar baixa
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/previstas"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 dark:text-emerald-300 underline"
              >
                Ver todas
              </Link>
            </Card>
          ) : null}

          <Card title="Últimos lançamentos" testid="home-recent" className="md:col-span-2">
            {h.recent.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhum lançamento ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {h.recent.map((t) => (
                  <LedgerRow
                    key={t.id}
                    item={t}
                    highlighted={false}
                    onOpen={() => openDetail(t.id)}
                    onHover={() => {}}
                  />
                ))}
              </ul>
            )}
            <Link
              href="/extrato"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 dark:text-emerald-300 underline"
            >
              Ver extrato
            </Link>
          </Card>
        </div>
      ) : null}
      <TransactionDetailDrawer id={detailId} source="home" onClose={closeDetail} />
      <PayPlannedDrawer plannedId={payingId} onClose={() => setPayingId(null)} />
    </main>
  );
}
