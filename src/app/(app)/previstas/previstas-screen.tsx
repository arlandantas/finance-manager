"use client";

import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Square,
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
import { UnlinkedBadge } from "@/components/ui/unlinked-badge";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useFamily } from "@/modules/familia/hooks";
import { plannedCopy } from "@/modules/previstas/copy";
import {
  useDeletePlanned,
  usePayables,
  usePlanned,
  usePlannedList,
  useReceivables,
  useUndoPlannedPayment,
} from "@/modules/previstas/hooks";
import { useEndSeries, useSeries, useSeriesImpact } from "@/modules/previstas/recurring-hooks";
import { differenceLabel } from "@/modules/previstas/rules";
import type {
  PayableItemDTO,
  PlannedExpenseDTO,
  PlannedKind,
  ReceivableItemDTO,
} from "@/modules/previstas/schemas";
import {
  canWritePlanned,
  canWriteTransaction,
  controllerNames,
  effectiveOwner,
  isUnlinkedActive,
  personalControllerIds,
  personalWriteMessage,
} from "@/modules/transacoes/ownership";
import { monthLabel, shiftMonthKey } from "../extrato/filters";
import { ByAccountBlock, ByAccountSkeleton, NO_ACCOUNT } from "./by-account-block";
import { PayPlannedDrawer } from "./pay-drawer";
import { PlannedDrawer } from "./planned-drawer";
import { useCanActOnReceivable } from "./receivable-access";

type Tab = "pay" | "receive" | "paid"; // US-051: A pagar · A receber · Pagas e recebidas
const TAB_PARAM: Record<Tab, string> = { pay: "pagar", receive: "receber", paid: "pagas" };
const tabFromParam = (v: string | null): Tab =>
  v === "receber" ? "receive" : v === "pagas" ? "paid" : "pay";
type ActionKind = "edit" | "edit-series" | "end-series" | "delete" | "undo";
type Action = { kind: ActionKind; id: string } | null;

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const first = (n: string) => n.split(" ")[0] ?? n;

function RecurringChip() {
  return (
    <span
      data-testid="recurring-chip"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
    >
      <Repeat size={12} aria-hidden="true" />
      Recorrente
    </span>
  );
}

function OverdueChip() {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:text-red-300">
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
  onAction: (kind: ActionKind) => void;
  onPay: () => void;
}) {
  const family = useFamily().data;
  // SEC-026: prevista "Só meu" só é alterada pelo responsável (dono); os outros veem, sem ações
  const planned = item.type === "PLANNED";
  const canAct =
    planned &&
    (family === undefined ||
      canWritePlanned(
        {
          isSharedExpense: item.isSharedExpense ?? true,
          responsibleMemberId: effectiveOwner(item.responsible).id ?? "",
          authorMemberId: item.authorId,
          accountOwnerMemberId: item.paymentAccountOwnerId ?? null,
        },
        { memberId: family.currentMemberId, role: family.currentRole },
        effectiveOwner(item.responsible).removed,
        isUnlinkedActive(item.responsible), // US-093b: tutor
      ));
  return (
    <li
      id={item.id}
      data-testid="payable-item"
      data-overdue={item.isOverdue ? "true" : undefined}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{item.title}</p>
        <p className="text-sm text-slate-600">
          Vence {brDate(item.dueOn)}
          {item.paymentAccountName
            ? item.type === "INVOICE"
              ? ` · Sai da conta ${item.paymentAccountName}`
              : ` · Pagar com ${item.paymentAccountName}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-semibold tabular-nums text-slate-900">
          <Money cents={item.amountInCents} />
        </span>
        {canAct ? (
          <Button variant="secondary" aria-label={`Dar baixa em ${item.title}`} onClick={onPay}>
            Dar baixa
          </Button>
        ) : null}
        {canAct ? (
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
                  {item.isRecurring ? "Editar só esta" : "Editar"}
                </MenuItem>
                {item.isRecurring ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      onAction("edit-series");
                    }}
                  >
                    <Repeat size={16} aria-hidden="true" />
                    Editar esta e as próximas
                  </MenuItem>
                ) : null}
                <MenuItem
                  onClick={() => {
                    close();
                    onAction("delete");
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {item.isRecurring ? "Excluir só esta" : "Excluir"}
                </MenuItem>
                {item.isRecurring ? (
                  <MenuItem
                    onClick={() => {
                      close();
                      onAction("end-series");
                    }}
                  >
                    <Square size={16} aria-hidden="true" />
                    Encerrar recorrência
                  </MenuItem>
                ) : null}
              </>
            )}
          </Menu>
        ) : null}
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-2">
        {item.isOverdue ? <OverdueChip /> : null}
        {item.invoiceStatus ? (
          <span
            data-testid="invoice-status"
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
          >
            {item.invoiceStatus === "CLOSED" ? "Fechada" : "Aberta"}
          </span>
        ) : null}
        {item.isRecurring ? <RecurringChip /> : null}
        {planned ? (
          <>
            {item.responsible ? (
              <span className="flex items-center gap-1 text-xs text-slate-600">
                <Avatar name={item.responsible.name} image={item.responsible.image} size={20} />
                {first(item.responsible.name)}
                {item.responsible.unlinked && !item.responsible.removed ? (
                  <UnlinkedBadge className="ml-1 px-1.5 py-0.5 text-[11px]" />
                ) : null}
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {item.isSharedExpense ? "Comum" : "Pessoal"}
            </span>
          </>
        ) : (
          <Link
            href={item.href}
            className="text-sm font-medium text-brand-800 dark:text-emerald-300 underline"
          >
            Ver fatura
          </Link>
        )}
      </div>
    </li>
  );
}

/** US-051: receita prevista pendente ("A receber"); as mesmas regras de controle da prevista (SEC-026). */
function ReceivableRow({
  item,
  onAction,
  onReceive,
}: {
  item: ReceivableItemDTO;
  onAction: (kind: ActionKind) => void;
  onReceive: () => void;
}) {
  const canAct = useCanActOnReceivable(item);
  return (
    <li
      id={item.id}
      data-testid="receivable-item"
      data-overdue={item.isOverdue ? "true" : undefined}
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-semibold text-slate-900">
          <CategoryIcon icon={item.category.icon} size={18} />
          <span className="truncate">{item.title}</span>
        </p>
        <p className="text-sm text-slate-600">
          Esperada {brDate(item.dueOn)}
          {item.destinationAccount ? ` · Cai na conta ${item.destinationAccount.name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-semibold tabular-nums text-slate-900">
          <Money cents={item.amountInCents} />
        </span>
        {canAct ? (
          <Button variant="secondary" aria-label={`Receber ${item.title}`} onClick={onReceive}>
            Receber
          </Button>
        ) : null}
        {canAct ? (
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
        <span className="flex items-center gap-1 text-xs text-slate-600">
          <Avatar name={item.responsible.name} image={item.responsible.image} size={20} />
          {first(item.responsible.name)}
          {item.responsible.unlinked && !item.responsible.removed ? (
            <UnlinkedBadge className="ml-1 px-1.5 py-0.5 text-[11px]" />
          ) : null}
        </span>
      </div>
    </li>
  );
}

function PaidRow({ item, onUndo }: { item: PlannedExpenseDTO; onUndo: () => void }) {
  const paid = item.paid;
  const fmt = useFormatMoney();
  const family = useFamily().data;
  const income = item.kind === "INCOME";
  const copy = plannedCopy(item.kind);
  // SEC-021: estornar a baixa de um "Só meu" é só do dono (quem pagou)
  const paidRow = paid
    ? {
        kind: income ? "INCOME" : "EXPENSE",
        isSharedExpense: item.isSharedExpense,
        payerMemberId: effectiveOwner(paid.payer).id,
        authorMemberId: paid.authorId ?? paid.payer.id,
        accountOwnerMemberId: paid.accountOwnerId ?? null,
      }
    : null;
  // US-051: desfazer o recebimento exige controle da receita prevista (a receita gerada não é "Só meu")
  const incomeControl =
    income &&
    (family === undefined ||
      canWritePlanned(
        {
          isSharedExpense: item.isSharedExpense,
          responsibleMemberId: effectiveOwner(item.responsible).id ?? "",
          authorMemberId: item.author.id,
          accountOwnerMemberId: item.paymentAccount?.ownerId ?? null,
        },
        { memberId: family.currentMemberId, role: family.currentRole },
        effectiveOwner(item.responsible).removed,
        isUnlinkedActive(item.responsible),
      ));
  const canUndo =
    !paid ||
    !paidRow ||
    (income
      ? incomeControl
      : family !== undefined &&
        canWriteTransaction(
          paidRow,
          { memberId: family.currentMemberId, role: family.currentRole },
          effectiveOwner(paid.payer).removed,
          isUnlinkedActive(paid.payer), // US-093b: tutor
        ));
  return (
    <li
      id={item.id}
      data-testid="paid-item"
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
          <CategoryIcon icon={item.category.icon} size={18} />
          <span className="truncate">{item.description}</span>
          {item.series ? <RecurringChip /> : null}
        </span>
        {paid ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {income ? "Recebida" : "Pago"} em {brDate(paid.paidOn)}
          </span>
        ) : null}
      </div>
      {paid ? (
        <p className="text-sm text-slate-700" data-testid="paid-summary">
          Previsto <Money cents={item.amountInCents} /> · {income ? "Recebido" : "Pago"}{" "}
          <Money cents={paid.amountInCents} />
        </p>
      ) : null}
      {paid ? (
        <p data-testid="paid-difference" className="text-sm font-medium text-slate-700">
          {differenceLabel(paid.differenceInCents, fmt)}
        </p>
      ) : null}
      {canUndo ? (
        <div>
          <Button
            variant="secondary"
            aria-label={`${copy.undoAction} de ${item.description}`}
            onClick={onUndo}
          >
            <Undo2 size={16} aria-hidden="true" />
            {copy.undoAction}
          </Button>
        </div>
      ) : (
        <p data-testid="personal-readonly" className="text-xs text-slate-600">
          {paidRow && family
            ? personalWriteMessage(
                controllerNames(
                  personalControllerIds(paidRow),
                  family.members.map((m) => ({
                    id: m.memberId,
                    name: m.name,
                    unlinked: m.unlinked,
                  })),
                  { adminCan: isUnlinkedActive(paid?.payer) },
                ),
                " (Só meu)",
              )
            : ""}
        </p>
      )}
    </li>
  );
}

export function PrevistasScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const periodParam = params.get("period");
  const period =
    periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : undefined;
  const [tab, setTab] = useState<Tab>(() => tabFromParam(params.get("tab"))); // US-051: ?tab=
  const [accountFilter, setAccountFilter] = useState<string | null>(null); // US-060: chave da conta
  const payables = usePayables(period);
  const receivables = useReceivables(period);
  const paidList = usePlannedList(period, "PAGO", "ALL"); // "Pagas e recebidas" mistura os dois tipos
  const [creating, setCreating] = useState<PlannedKind | null>(null);
  const [action, setAction] = useState<Action>(null);
  const detail = usePlanned(action?.id ?? null);
  const del = useDeletePlanned();
  const deleteKey = useRef(newIdempotencyKey());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const undo = useUndoPlannedPayment();

  const periodKey = payables.data?.period.key ?? period;
  const tabQuery = tab === "pay" ? "" : `&tab=${TAB_PARAM[tab]}`;
  const go = (delta: number) => {
    setAccountFilter(null); // trocar de mês limpa o filtro por conta
    if (periodKey)
      router.replace(`/previstas?period=${shiftMonthKey(periodKey, delta)}${tabQuery}`);
  };

  const active = tab === "pay" ? payables : tab === "receive" ? receivables : paidList;
  const planned = detail.data?.plannedExpense ?? null;
  const endSeries = useEndSeries();
  const endingSeriesId = action?.kind === "end-series" ? (planned?.series?.id ?? null) : null;
  const endingSeries = useSeries(endingSeriesId);
  const endingImpact = useSeriesImpact(endingSeriesId, undefined);

  function openAction(kind: ActionKind, id: string) {
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
          toast.success(
            planned.kind === "INCOME" ? "Receita prevista excluída" : "Despesa prevista excluída",
          );
          setAction(null);
        },
        onError: (e) => {
          if (e instanceof ApiClientError || e instanceof NetworkError) setDeleteError(e.message);
          else setDeleteError("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  function confirmEndSeries() {
    const s = endingSeries.data?.series;
    if (!s) return;
    endSeries.mutate(
      { id: s.id, version: s.version, idempotencyKey: deleteKey.current },
      {
        onSuccess: (r) => {
          toast.success(
            r.removedCount === 1
              ? "Recorrência encerrada: 1 prevista removida"
              : `Recorrência encerrada: ${r.removedCount} previstas removidas`,
          );
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
          toast.success(planned.kind === "INCOME" ? "Recebimento desfeito" : "Pagamento desfeito");
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
        <h1 className="text-2xl font-semibold text-slate-900">Previstas</h1>
        <Button onClick={() => setCreating(tab === "receive" ? "INCOME" : "EXPENSE")}>
          <Plus size={18} aria-hidden="true" />
          {tab === "receive" ? "Nova receita prevista" : "Nova despesa prevista"}
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

      {tab === "receive" && receivables.data ? (
        <section
          aria-label="Total do mês"
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-brand-800 p-4 text-white"
        >
          <p className="text-sm text-brand-100">A receber</p>
          <p data-testid="receivables-total" className="text-3xl font-bold tabular-nums">
            <Money cents={receivables.data.totals.dueInCents} />
          </p>
          {receivables.data.totals.overdueCount > 0 ? (
            <p data-testid="receivables-overdue" className="w-full text-sm text-brand-100">
              {receivables.data.totals.overdueCount} atrasada(s):{" "}
              <Money cents={receivables.data.totals.overdueInCents} />
            </p>
          ) : null}
        </section>
      ) : null}

      {tab !== "receive" && payables.data ? (
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

      {tab === "pay" && payables.isPending ? <ByAccountSkeleton /> : null}
      {tab === "pay" && payables.data ? (
        <ByAccountBlock
          data={payables.data.byAccount}
          totalInCents={payables.data.totals.dueInCents}
          filter={accountFilter}
          onFilter={setAccountFilter}
        />
      ) : null}

      <div
        role="tablist"
        aria-label="Situação"
        className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {(
          [
            ["pay", "A pagar"],
            ["receive", "A receber"],
            ["paid", "Pagas e recebidas"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "min-h-11 rounded-lg px-1 text-sm font-semibold",
              tab === k ? "bg-white dark:bg-slate-100 text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {active.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando previstas">
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
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => active.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {tab === "pay" && payables.data ? (
        payables.data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-8 text-center">
            <p className="text-slate-700">Nenhuma conta a pagar neste mês</p>
            <Button onClick={() => setCreating("EXPENSE")}>Nova despesa prevista</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {(
              [
                ["Faturas", payables.data.groups.invoices],
                ["Previstas", payables.data.groups.planned],
              ] as const
            ).map(([label, all]) => {
              const group =
                accountFilter === null
                  ? all
                  : all.filter((i) => (i.paymentAccountId ?? NO_ACCOUNT) === accountFilter);
              return group.length === 0 ? null : (
                <section key={label} aria-label={label} className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
                  <ul className="flex flex-col gap-2" aria-label={`Contas a pagar: ${label}`}>
                    {group.map((item) => (
                      <PayableRow
                        key={`${item.type}-${item.id}`}
                        item={item}
                        onAction={(kind) => openAction(kind, item.id)}
                        onPay={() => setPayingId(item.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "receive" && receivables.data ? (
        receivables.data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-8 text-center">
            <p className="text-slate-700">Nenhuma receita a receber neste mês</p>
            <Button onClick={() => setCreating("INCOME")}>Cadastrar receita prevista</Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Receitas a receber">
            {receivables.data.items.map((item) => (
              <ReceivableRow
                key={item.id}
                item={item}
                onAction={(kind) => openAction(kind, item.id)}
                onReceive={() => setPayingId(item.id)}
              />
            ))}
          </ul>
        )
      ) : null}

      {tab === "paid" && paidList.data ? (
        paidList.data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-6 text-center text-slate-700">
            Nenhuma conta paga ou recebida neste mês
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Pagas e recebidas">
            {paidList.data.items.map((item) => (
              <PaidRow key={item.id} item={item} onUndo={() => openAction("undo", item.id)} />
            ))}
          </ul>
        )
      ) : null}

      <PlannedDrawer
        open={creating !== null}
        planned={null}
        defaultKind={creating ?? "EXPENSE"}
        onClose={() => setCreating(null)}
      />
      <PlannedDrawer
        open={action?.kind === "edit" && planned !== null}
        planned={planned}
        onClose={() => setAction(null)}
      />

      <PlannedDrawer
        open={action?.kind === "edit-series" && planned !== null}
        planned={planned}
        mode="series"
        onClose={() => setAction(null)}
      />

      <PayPlannedDrawer plannedId={payingId} onClose={() => setPayingId(null)} />

      <Drawer
        open={action?.kind === "end-series"}
        onOpenChange={(o) => !o && setAction(null)}
        title="Encerrar recorrência?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700" data-testid="end-series-impact">
            {endingImpact.isPending || endingSeries.isPending
              ? "Calculando…"
              : endingImpact.data
                ? `${endingImpact.data.endCount} ${
                    endingImpact.data.endCount === 1
                      ? "prevista pendente será removida"
                      : "previstas pendentes serão removidas"
                  }. As já pagas e as atrasadas continuam no histórico. Não dá para reabrir a recorrência depois.`
                : "Não foi possível calcular o impacto."}
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {deleteError}
            </p>
          ) : null}
          <Button
            variant="danger"
            disabled={endSeries.isPending || !endingSeries.data}
            onClick={confirmEndSeries}
          >
            {endSeries.isPending ? "Encerrando…" : "Encerrar recorrência"}
          </Button>
          <Button variant="ghost" onClick={() => setAction(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={action?.kind === "undo"}
        onOpenChange={(o) => !o && setAction(null)}
        title={planned?.kind === "INCOME" ? "Desfazer recebimento?" : "Desfazer pagamento?"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            {planned?.kind === "INCOME"
              ? "A receita gerada sai do extrato e dos totais, o saldo da conta volta e a previsão volta a ficar pendente."
              : "A despesa gerada sai do extrato, dos totais e do acerto, o saldo da conta volta e a previsão volta a ficar pendente."}
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {deleteError}
            </p>
          ) : null}
          <Button variant="danger" disabled={undo.isPending || !planned} onClick={confirmUndo}>
            {undo.isPending
              ? "Desfazendo…"
              : planned?.kind === "INCOME"
                ? "Desfazer recebimento"
                : "Desfazer pagamento"}
          </Button>
          <Button variant="ghost" onClick={() => setAction(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={action?.kind === "delete"}
        onOpenChange={(o) => !o && setAction(null)}
        title={
          planned?.kind === "INCOME" ? "Excluir receita prevista?" : "Excluir despesa prevista?"
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            {planned?.kind === "INCOME"
              ? "A previsão deixa de aparecer em A receber. Nenhum saldo ou lançamento é alterado."
              : "A previsão deixa de aparecer em Contas a pagar. Nenhum saldo ou lançamento é alterado."}
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
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
