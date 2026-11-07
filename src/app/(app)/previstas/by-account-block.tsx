"use client";

import { TriangleAlert, X } from "lucide-react";
import { Money } from "@/components/money";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import type { ByAccount, ByAccountRow } from "@/modules/previstas/schemas";

/** Chave do filtro por conta: id da conta, ou "none" para "Sem conta definida" (SDD-029 D-TL-U4-6). */
export const NO_ACCOUNT = "none";
export const rowKey = (r: ByAccountRow) => r.account?.id ?? NO_ACCOUNT;
export const rowLabel = (r: ByAccountRow) => r.account?.name ?? "Sem conta definida";

const GRID = "lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]";
const GRID_TRANSFERS = "lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]"; // US-100b

export function ByAccountSkeleton() {
  return (
    <div
      className="flex flex-col gap-2"
      aria-busy="true"
      aria-label="Carregando resumo por conta"
      data-testid="by-account-skeleton"
    >
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

function Cell({
  label,
  className,
  children,
  testId,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2 lg:block", className)}>
      {/* Mobile: rótulo visível em cada cartão; desktop: o cabeçalho da tabela rotula, o leitor de tela mantém este */}
      <span className="text-xs text-slate-600 lg:sr-only">{label}</span>
      <span data-testid={testId} className="tabular-nums lg:block lg:text-right">
        {children}
      </span>
    </div>
  );
}

function Row({
  row,
  pressed,
  withTransfers,
  onToggle,
}: {
  row: ByAccountRow;
  pressed: boolean;
  withTransfers: boolean;
  onToggle: () => void;
}) {
  const none = row.account === null;
  return (
    <li>
      <button
        type="button"
        aria-pressed={pressed}
        data-testid="by-account-row"
        data-account={rowLabel(row)}
        onClick={onToggle}
        className={cn(
          "grid w-full grid-cols-1 gap-x-3 gap-y-1 rounded-xl border bg-white p-3 text-left dark:bg-slate-100 lg:items-center",
          withTransfers ? GRID_TRANSFERS : GRID,
          pressed ? "border-brand-700 ring-2 ring-brand-700" : "border-slate-200",
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2 font-semibold text-slate-900">
          <span className="truncate" data-testid="by-account-name">
            {rowLabel(row)}
          </span>
          {row.account?.archived ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Arquivada
            </span>
          ) : null}
          {row.account?.excludeFromAvailable ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Reserva
            </span>
          ) : null}
        </span>
        <Cell label="Saldo atual (hoje)" testId="by-account-balance" className="text-slate-900">
          {row.balanceInCents === null ? "—" : <Money cents={row.balanceInCents} />}
        </Cell>
        <Cell label="A pagar" testId="by-account-due" className="text-slate-900">
          <Money cents={row.dueInCents} />
        </Cell>
        {withTransfers ? (
          <Cell label="Transferências previstas" testId="by-account-transfers">
            {row.plannedTransfersInCents === 0 ? (
              "—"
            ) : (
              <Money cents={row.plannedTransfersInCents} signed />
            )}
          </Cell>
        ) : null}
        <Cell label="Saldo previsto" testId="by-account-projected">
          {none || row.projectedInCents === null ? (
            "—"
          ) : row.shortfallInCents > 0 ? (
            <span
              data-testid="by-account-shortfall"
              className="inline-flex items-center gap-1 font-semibold text-red-800 dark:text-red-300"
            >
              <TriangleAlert size={14} aria-hidden="true" />
              Falta <Money cents={row.shortfallInCents} />
            </span>
          ) : (
            <span className="font-semibold text-slate-900">
              <Money cents={row.projectedInCents} />
            </span>
          )}
        </Cell>
      </button>
    </li>
  );
}

/** US-060 / SDD-029 §6: resumo por conta no topo do "A pagar". Marcação única, grid responsivo. */
export function ByAccountBlock({
  data,
  totalInCents,
  filter,
  onFilter,
}: {
  data: ByAccount;
  totalInCents: number;
  filter: string | null;
  onFilter: (key: string | null) => void;
}) {
  if (data.rows.length === 0) {
    return (
      <p
        data-testid="by-account-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-700 dark:bg-slate-100"
      >
        Nenhuma conta com saldo ou a pagar neste mês
      </p>
    );
  }
  const active = data.rows.find((r) => rowKey(r) === filter);
  const withTransfers = data.columns.plannedTransfers;
  const grid = withTransfers ? GRID_TRANSFERS : GRID;
  return (
    <section aria-label="Resumo por conta" data-testid="by-account" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-700">Por conta</h2>
      <div
        aria-hidden="true"
        className={cn("hidden gap-x-3 px-3 text-xs font-medium text-slate-600 lg:grid", grid)}
      >
        <span>Conta</span>
        <span className="text-right">Saldo atual (hoje)</span>
        <span className="text-right">A pagar</span>
        {withTransfers ? <span className="text-right">Transferências previstas</span> : null}
        <span className="text-right">Saldo previsto</span>
      </div>
      <ul className="flex flex-col gap-2" aria-label="Contas">
        {data.rows.map((r) => (
          <Row
            key={rowKey(r)}
            row={r}
            pressed={filter === rowKey(r)}
            withTransfers={withTransfers}
            onToggle={() => onFilter(filter === rowKey(r) ? null : rowKey(r))}
          />
        ))}
      </ul>
      <p
        className={cn(
          "flex items-baseline justify-between gap-3 px-3 text-sm font-semibold text-slate-900 lg:grid",
          grid,
        )}
      >
        <span>Total</span>
        <span className="hidden lg:block" />
        <span data-testid="by-account-total" className="tabular-nums lg:text-right">
          <Money cents={totalInCents} />
        </span>
        {withTransfers ? <span className="hidden lg:block" /> : null}
        <span className="hidden lg:block" />
      </p>
      {active ? (
        <p className="flex items-center gap-2 text-sm">
          <button
            type="button"
            data-testid="by-account-chip"
            onClick={() => onFilter(null)}
            aria-label={`Limpar filtro: ${rowLabel(active)}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-brand-100 px-3 text-sm font-medium text-brand-800 dark:bg-emerald-100 dark:text-emerald-300"
          >
            Conta: {rowLabel(active)}
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      ) : null}
    </section>
  );
}
