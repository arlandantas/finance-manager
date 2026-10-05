"use client";

import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Money, useMoneyText } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { useHome } from "@/modules/home/hooks";
import type { HomeDTO } from "@/modules/home/schemas";
import { heroText } from "@/modules/split/hero";
import { LedgerRow } from "./extrato/ledger-row";
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
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4",
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
              className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-slate-900 hover:bg-white"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  s.done
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-brand-800 ring-1 ring-brand-700",
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

function SettlementCard({ h }: { h: HomeDTO }) {
  const maskText = useMoneyText();
  const hero = heroText(h.settlement);
  const needs = h.settlement.status === "NEEDS_MORE_MEMBERS";
  const ok = h.settlement.status === "BALANCED" || h.settlement.status === "SETTLED";
  return (
    <Link
      href={needs ? "/familia" : `/acerto?period=${h.settlement.period.key}`}
      data-testid="home-settlement"
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl p-4 text-white",
        ok ? "bg-emerald-700" : "bg-brand-800",
      )}
    >
      <span className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
          Acerto do mês
        </span>
        <span className="text-xl font-bold leading-tight">
          {needs ? "Convide quem divide as contas" : maskText(hero.title)}
        </span>
        {hero.detail && !needs ? <span className="text-sm opacity-90">{hero.detail}</span> : null}
      </span>
      <ChevronRight aria-hidden="true" size={22} />
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando início" className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-52" />
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
      <Skeleton className="h-72" />
    </div>
  );
}

export function HomeScreen({ firstName }: { firstName: string }) {
  const home = useHome();
  const router = useRouter();
  const [payingId, setPayingId] = useState<string | null>(null);
  const h = home.data;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">Olá, {firstName}</h1>

      {home.isPending ? <HomeSkeleton /> : null}
      {home.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => home.refetch()}>
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

          <Card title="Saldo" testid="home-balance">
            <p
              data-testid="family-balance"
              className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-600"
            >
              Saldo da família:{" "}
              <span
                data-testid="family-balance-value"
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  h.familyBalanceInCents < 0 ? "text-red-700" : "text-slate-900",
                )}
              >
                <Money cents={h.familyBalanceInCents} />
              </span>
            </p>
            {h.accounts.length > 0 ? (
              <ul className="flex flex-col divide-y divide-slate-100">
                {h.accounts.map((a) => (
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
                          a.balanceInCents < 0 ? "text-red-700" : "text-slate-900",
                        )}
                      >
                        <Money cents={a.balanceInCents} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href="/contas" className="text-sm font-semibold text-brand-800 underline">
                Cadastrar conta
              </Link>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <SettlementCard h={h} />
            <Card title="Resumo do mês" testid="home-summary">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Receitas</p>
                  <p
                    data-testid="home-income"
                    className="text-lg font-semibold tabular-nums text-emerald-700"
                  >
                    <Money cents={h.monthSummary.incomeInCents} />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Despesas</p>
                  <p
                    data-testid="home-expense"
                    className="text-lg font-semibold tabular-nums text-slate-900"
                  >
                    <Money cents={h.monthSummary.expenseInCents} />
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-1">
                {h.monthSummary.byMember.map((m) => (
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
          </div>

          {h.payables.items.length > 0 ? (
            <Card title="A pagar" testid="home-payables" className="md:col-span-2">
              <ul className="flex flex-col divide-y divide-slate-100">
                {h.payables.items.map((p) => (
                  <li
                    key={`${p.type}-${p.id}`}
                    data-testid="home-payable"
                    className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{p.title}</span>
                      <span className="text-slate-600">
                        {p.isOverdue ? (
                          <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
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
                          <Link href={p.href} className="font-medium text-brand-800 underline">
                            Ver fatura
                          </Link>
                          <Link
                            href={`${p.href}&pay=1`}
                            className="font-medium text-brand-800 underline"
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
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 underline"
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
                    onOpen={() => router.push("/extrato")}
                    onHover={() => {}}
                  />
                ))}
              </ul>
            )}
            <Link
              href="/extrato"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 underline"
            >
              Ver extrato
            </Link>
          </Card>
        </div>
      ) : null}
      <PayPlannedDrawer plannedId={payingId} onClose={() => setPayingId(null)} />
    </main>
  );
}
