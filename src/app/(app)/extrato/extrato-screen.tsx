"use client";

import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Money } from "@/components/money";
import { useQuickAdd } from "@/components/quick-add";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/lib/use-media-query";
import { useLedger } from "@/modules/transacoes/hooks";
import type { LedgerUiFilters } from "@/modules/transacoes/optimistic";
import {
  activeFilterCount,
  filtersToSearch,
  monthLabel,
  parseFilters,
  shiftMonthKey,
} from "./filters";
import { FiltersPanel } from "./filters-panel";
import { LedgerRow } from "./ledger-row";
import { TransactionDetailDrawer } from "./transaction-detail-drawer";

function Totals({
  income,
  expense,
  balance,
}: {
  income: number;
  expense: number;
  balance: number;
}) {
  const cell = (label: string, value: number, testid: string, tone: string) => (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        data-testid={testid}
        className={cn("break-words text-sm font-semibold tabular-nums sm:text-base", tone)}
      >
        <Money cents={value} />
      </p>
    </div>
  );
  return (
    <section
      aria-label="Totais do filtro"
      className="sticky top-14 z-10 flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      {cell("Receitas", income, "totals-income", "text-emerald-700")}
      {cell("Despesas", expense, "totals-expense", "text-slate-900")}
      {cell(
        "Saldo do filtro",
        balance,
        "totals-balance",
        balance < 0 ? "text-red-700" : "text-slate-900",
      )}
    </section>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando extrato" className="flex flex-col gap-3">
      <Skeleton className="h-[68px]" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={`row-skeleton-${i}`} className="h-[72px]" />
      ))}
    </div>
  );
}

export function ExtratoScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const quickAdd = useQuickAdd();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  // `highlight=<id>`: parâmetro só de interface (SDD-010 §4.6); id que não existe é ignorado
  const highlightId = searchParams.get("highlight");

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const ledger = useLedger(filters);

  const replaceFilters = useCallback(
    (next: LedgerUiFilters) => {
      const qs = filtersToSearch(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  // Mudanças rápidas em sequência partem do último valor pedido (a URL só atualiza depois da navegação).
  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  }, [filters]);
  const patchFilters = useCallback(
    (patch: Partial<LedgerUiFilters>) => {
      const merged: LedgerUiFilters = { ...latest.current, ...patch };
      for (const k of Object.keys(merged) as Array<keyof LedgerUiFilters>) {
        if (merged[k] === undefined) delete merged[k];
      }
      latest.current = merged;
      replaceFilters(merged);
    },
    [replaceFilters],
  );

  const pages = ledger.data?.pages ?? [];
  const first = pages[0];
  const items = pages.flatMap((p) => p.items);
  const periodKey = filters.period ?? first?.period?.key ?? null;

  // Rolagem infinita (limit = 30); nunca carrega tudo de uma vez.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = ledger;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (highlightId && items.some((i) => i.id === highlightId)) {
      document
        .querySelector("[data-highlighted='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightId, items]);

  const filterCount = activeFilterCount(filters);
  const noTransactionsAtAll =
    first && items.length === 0 && first.hasAnyTransactions === false && filterCount === 0;

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Extrato</h1>
        <div className="flex items-center gap-1" role="group" aria-label="Período">
          <button
            type="button"
            aria-label="Mês anterior"
            disabled={!periodKey}
            onClick={() => periodKey && patchFilters({ period: shiftMonthKey(periodKey, -1) })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <span
            data-testid="period-label"
            className="min-w-36 text-center text-sm font-semibold text-slate-900"
          >
            {periodKey ? monthLabel(periodKey) : "…"}
          </span>
          <button
            type="button"
            aria-label="Próximo mês"
            disabled={!periodKey}
            onClick={() => periodKey && patchFilters({ period: shiftMonthKey(periodKey, 1) })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {isDesktop ? (
        <section aria-label="Filtros" className="rounded-xl border border-slate-200 bg-white p-3">
          <FiltersPanel filters={filters} onChange={patchFilters} idPrefix="f" />
        </section>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Filtros{filterCount > 0 ? ` (${filterCount})` : ""}
          </Button>
          {filterCount > 0 ? (
            <Button
              variant="ghost"
              onClick={() => replaceFilters(filters.period ? { period: filters.period } : {})}
            >
              Limpar filtros
            </Button>
          ) : null}
        </div>
      )}
      {!isDesktop ? (
        <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros">
          <FiltersPanel filters={filters} onChange={patchFilters} idPrefix="m" />
          <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
            Ver resultados
          </Button>
        </Drawer>
      ) : null}

      {ledger.isPending ? <ListSkeleton /> : null}

      {ledger.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => ledger.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {first?.totals ? (
        <Totals
          income={first.totals.incomeInCents}
          expense={first.totals.expenseInCents}
          balance={first.totals.balanceInCents}
        />
      ) : null}

      {noTransactionsAtAll ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-700">Faça seu primeiro lançamento</p>
          <Button onClick={() => quickAdd.open()}>Novo lançamento</Button>
        </div>
      ) : null}

      {first && items.length === 0 && !noTransactionsAtAll ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-700">Nenhum lançamento encontrado</p>
          <Button variant="secondary" onClick={() => replaceFilters({})}>
            Limpar filtros
          </Button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Lançamentos">
          {items.map((item) => (
            <LedgerRow
              key={item.id}
              item={item}
              highlighted={
                item.id === highlightId ||
                (hoverGroup !== null && hoverGroup === item.transferGroupId)
              }
              onOpen={() => setDetailId(item.id)}
              onHover={setHoverGroup}
            />
          ))}
        </ul>
      ) : null}

      {hasNextPage ? (
        <div ref={sentinel} className="flex justify-center py-2">
          <Button
            variant="ghost"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}

      <TransactionDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </main>
  );
}
