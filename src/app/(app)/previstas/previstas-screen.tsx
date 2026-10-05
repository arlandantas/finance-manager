"use client";

import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { Money, useFormatMoney } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  useDeletePlanned,
  usePayables,
  usePlanned,
  usePlannedList,
  useUndoPlannedPayment,
} from "@/modules/previstas/hooks";
import { differenceLabel } from "@/modules/previstas/rules";
import type { PayableItemDTO, PlannedExpenseDTO } from "@/modules/previstas/schemas";
import { monthLabel, shiftMonthKey } from "../extrato/filters";
import { PayPlannedDrawer } from "./pay-drawer";
import { PlannedDrawer } from "./planned-drawer";

type Tab = "pay" | "paid";
type Action = { kind: "edit" | "delete" | "undo"; id: string } | null;

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const first = (n: string) => n.split(" ")[0] ?? n;

function OverdueChip() {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      Atrasada
    </span>
  );
}

function PayableRow({
  item,
  onAction,
  onPay,
}: {
  item: PayableItemDTO;
  onAction: (kind: "edit" | "delete") => void;
  onPay: () => void;
}) {
  const planned = item.type === "PLANNED";
  return (
    <li
      id={item.id}
      data-testid="payable-item"
      data-overdue={item.isOverdue ? "true" : undefined}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white p-3"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{item.title}</p>
        <p className="text-sm text-slate-600">Vence {brDate(item.dueOn)}</p>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-semibold tabular-nums text-slate-900">
          <Money cents={item.amountInCents} />
        </span>
        {planned ? (
          <Button variant="secondary" aria-label={`Dar baixa em ${item.title}`} onClick={onPay}>
            Dar baixa
          </Button>
        ) : null}
        {planned ? (
          <Menu
            label={`Ações de ${item.title}`}
            trigger={<MoreHorizontal size={20} aria-hidden="true" />}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    onAction("edit");
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    onAction("delete");
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Excluir
                </MenuItem>
              </>
            )}
          </Menu>
        ) : null}
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-2">
        {item.isOverdue ? <OverdueChip /> : null}
        {planned ? (
          <>
            {item.responsible ? (
              <span className="flex items-center gap-1 text-xs text-slate-600">
                <Avatar name={item.responsible.name} image={item.responsible.image} size={20} />
                {first(item.responsible.name)}
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {item.isSharedExpense ? "Comum" : "Pessoal"}
            </span>
          </>
        ) : (
          <Link href={item.href} className="text-sm font-medium text-brand-800 underline">
            Ver fatura
          </Link>
        )}
      </div>
    </li>
  );
}

function PaidRow({ item, onUndo }: { item: PlannedExpenseDTO; onUndo: () => void }) {
  const paid = item.paid;
  const fmt = useFormatMoney();
  return (
    <li
      id={item.id}
      data-testid="paid-item"
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
          <CategoryIcon icon={item.category.icon} size={18} />
          <span className="truncate">{item.description}</span>
        </span>
        {paid ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            Pago em {brDate(paid.paidOn)}
          </span>
        ) : null}
      </div>
      {paid ? (
        <p className="text-sm text-slate-700" data-testid="paid-summary">
          Previsto <Money cents={item.amountInCents} /> · Pago <Money cents={paid.amountInCents} />
        </p>
      ) : null}
      {paid ? (
        <p data-testid="paid-difference" className="text-sm font-medium text-slate-700">
          {differenceLabel(paid.differenceInCents, fmt)}
        </p>
      ) : null}
      <div>
        <Button
          variant="secondary"
          aria-label={`Desfazer pagamento de ${item.description}`}
          onClick={onUndo}
        >
          <Undo2 size={16} aria-hidden="true" />
          Desfazer pagamento
        </Button>
      </div>
    </li>
  );
}

export function PrevistasScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const periodParam = params.get("period");
  const period =
    periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : undefined;
  const [tab, setTab] = useState<Tab>("pay");
  const payables = usePayables(period);
  const paidList = usePlannedList(period, "PAGO");
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const detail = usePlanned(action?.id ?? null);
  const del = useDeletePlanned();
  const deleteKey = useRef(newIdempotencyKey());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const undo = useUndoPlannedPayment();

  const periodKey = payables.data?.period.key ?? period;
  const go = (delta: number) => {
    if (periodKey) router.replace(`/previstas?period=${shiftMonthKey(periodKey, delta)}`);
  };

  const active = tab === "pay" ? payables : paidList;
  const planned = detail.data?.plannedExpense ?? null;

  function openAction(kind: "edit" | "delete" | "undo", id: string) {
    deleteKey.current = newIdempotencyKey();
    setDeleteError(null);
    setAction({ kind, id });
  }

  function confirmDelete() {
    if (!planned) return;
    del.mutate(
      { id: planned.id, version: planned.version, idempotencyKey: deleteKey.current },
      {
        onSuccess: () => {
          toast.success("Despesa prevista excluída");
          setAction(null);
        },
        onError: (e) => {
          if (e instanceof ApiClientError || e instanceof NetworkError) setDeleteError(e.message);
          else setDeleteError("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  function confirmUndo() {
    if (!planned) return;
    undo.mutate(
      { id: planned.id, version: planned.version, idempotencyKey: deleteKey.current },
      {
        onSuccess: () => {
          toast.success("Pagamento desfeito");
          setAction(null);
        },
        onError: (e) => {
          if (e instanceof ApiClientError || e instanceof NetworkError) setDeleteError(e.message);
          else setDeleteError("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Contas a pagar</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" />
          Nova despesa prevista
        </Button>
      </header>

      <div className="flex items-center justify-center gap-1" role="group" aria-label="Período">
        <button
          type="button"
          aria-label="Mês anterior"
          disabled={!periodKey}
          onClick={() => go(-1)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span
          data-testid="period-label"
          className="min-w-40 text-center text-sm font-semibold text-slate-900"
        >
          {periodKey ? monthLabel(periodKey) : "…"}
        </span>
        <button
          type="button"
          aria-label="Próximo mês"
          disabled={!periodKey}
          onClick={() => go(1)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      {payables.data ? (
        <section
          aria-label="Total do mês"
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-brand-800 p-4 text-white"
        >
          <p className="text-sm text-brand-100">A pagar</p>
          <p data-testid="payables-total" className="text-3xl font-bold tabular-nums">
            <Money cents={payables.data.totals.dueInCents} />
          </p>
          {payables.data.totals.overdueCount > 0 ? (
            <p data-testid="payables-overdue" className="w-full text-sm text-brand-100">
              {payables.data.totals.overdueCount} atrasada(s):{" "}
              <Money cents={payables.data.totals.overdueInCents} />
            </p>
          ) : null}
        </section>
      ) : null}

      <div
        role="tablist"
        aria-label="Situação"
        className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {(
          [
            ["pay", "A pagar"],
            ["paid", "Pagas"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-11 rounded-lg text-sm font-semibold",
              tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {active.isPending ? (
        <div
          className="flex flex-col gap-2"
          aria-busy="true"
          aria-label="Carregando contas a pagar"
        >
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}

      {active.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => active.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {tab === "pay" && payables.data ? (
        payables.data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-700">Nenhuma conta a pagar neste mês</p>
            <Button onClick={() => setCreating(true)}>Nova despesa prevista</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Contas a pagar">
            {payables.data.items.map((item) => (
              <PayableRow
                key={`${item.type}-${item.id}`}
                item={item}
                onAction={(kind) => openAction(kind, item.id)}
                onPay={() => setPayingId(item.id)}
              />
            ))}
          </ul>
        )
      ) : null}

      {tab === "paid" && paidList.data ? (
        paidList.data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">
            Nenhuma conta paga neste mês
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Contas pagas">
            {paidList.data.items.map((item) => (
              <PaidRow key={item.id} item={item} onUndo={() => openAction("undo", item.id)} />
            ))}
          </ul>
        )
      ) : null}

      <PlannedDrawer open={creating} planned={null} onClose={() => setCreating(false)} />
      <PlannedDrawer
        open={action?.kind === "edit" && planned !== null}
        planned={planned}
        onClose={() => setAction(null)}
      />

      <PayPlannedDrawer plannedId={payingId} onClose={() => setPayingId(null)} />

      <Drawer
        open={action?.kind === "undo"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Desfazer pagamento?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            A despesa gerada sai do extrato, dos totais e do acerto, o saldo da conta volta e a
            previsão volta a ficar pendente.
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700">
              {deleteError}
            </p>
          ) : null}
          <Button variant="danger" disabled={undo.isPending || !planned} onClick={confirmUndo}>
            {undo.isPending ? "Desfazendo…" : "Desfazer pagamento"}
          </Button>
          <Button variant="ghost" onClick={() => setAction(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={action?.kind === "delete"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Excluir despesa prevista?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            A previsão deixa de aparecer em Contas a pagar. Nenhum saldo ou lançamento é alterado.
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700">
              {deleteError}
            </p>
          ) : null}
          <Button variant="danger" disabled={del.isPending || !planned} onClick={confirmDelete}>
            {del.isPending ? "Excluindo…" : "Excluir"}
          </Button>
          <Button variant="ghost" onClick={() => setAction(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </main>
  );
}
