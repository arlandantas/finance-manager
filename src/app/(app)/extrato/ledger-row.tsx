"use client";

import { ArrowLeftRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import type { PendingTransaction } from "@/modules/transacoes/optimistic";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function rowTitle(t: PendingTransaction): string {
  if (t.type === "TRANSFER_OUT" && !t.isSettlement)
    return `Transferência para ${t.counterpartAccount?.name ?? "outra conta"}`;
  if (t.type === "TRANSFER_IN" && !t.isSettlement)
    return `Transferência de ${t.counterpartAccount?.name ?? "outra conta"}`;
  return t.description;
}

/** Fatura (US-040a): "{descrição} {no}/{count}" montado aqui; a descrição gravada não leva o sufixo. */
export function installmentTitle(t: PendingTransaction): string {
  return t.installment
    ? `${t.description} ${t.installment.no}/${t.installment.count}`
    : rowTitle(t);
}

export function LedgerRow({
  item,
  highlighted,
  onOpen,
  onHover,
  installmentInTitle = false,
}: {
  installmentInTitle?: boolean;
  item: PendingTransaction;
  highlighted: boolean;
  onOpen: () => void;
  onHover: (groupId: string | null) => void;
}) {
  const income = item.direction === "CREDIT";
  const isTransfer = item.type === "TRANSFER_IN" || item.type === "TRANSFER_OUT";
  const isPayment = item.type === "INVOICE_PAYMENT";
  const neutral = isTransfer || isPayment;
  const archivedMark = item.card?.archived
    ? " (arquivado)"
    : !item.card && item.account?.archived
      ? " (arquivada)"
      : "";
  const sourceName =
    (isPayment ? (item.account?.name ?? "") : (item.card?.name ?? item.account?.name ?? "")) +
    archivedMark;
  const kindLabel = item.category?.name ?? (isPayment ? "Pagamento de fatura" : "Transferência");
  const signedCents = income ? item.amountInCents : -item.amountInCents;
  return (
    <li>
      <button
        type="button"
        data-testid="ledger-row"
        data-highlighted={highlighted ? "true" : undefined}
        data-pending={item.pending ? "true" : undefined}
        onClick={onOpen}
        onMouseEnter={() => onHover(item.transferGroupId)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(item.transferGroupId)}
        onBlur={() => onHover(null)}
        className={cn(
          "grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border bg-white dark:bg-slate-100 p-3 text-left hover:bg-slate-50",
          "md:grid-cols-[88px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:gap-x-4",
          highlighted ? "border-brand-700 ring-1 ring-brand-700" : "border-slate-200",
          item.pending && "opacity-70",
          item.deletedAt && "bg-slate-50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full md:hidden",
            income
              ? "bg-emerald-100 text-emerald-800 dark:text-emerald-300"
              : "bg-slate-100 text-slate-700",
          )}
        >
          {neutral ? (
            <ArrowLeftRight size={20} />
          ) : item.category ? (
            <CategoryIcon icon={item.category.icon} />
          ) : null}
        </span>
        <span className="hidden text-sm text-slate-500 md:block">{shortDate(item.occurredOn)}</span>

        <span className="min-w-0">
          <span
            className={cn(
              "block break-words font-medium md:truncate text-slate-900",
              item.deletedAt && "line-through",
            )}
          >
            {installmentInTitle ? installmentTitle(item) : rowTitle(item)}
          </span>
          <span className="block break-words text-xs text-slate-500 md:hidden">
            {shortDate(item.occurredOn)} · {kindLabel} · {sourceName}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            {item.type === "EXPENSE" ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {item.isSharedExpense ? "Comum" : "Pessoal"}
              </span>
            ) : null}
            {item.card && item.type === "EXPENSE" ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                Cartão
              </span>
            ) : null}
            {item.invoice ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                Fatura {formatInvoiceLabel(item.invoice.ref)}
                {item.installment ? ` · ${item.installment.no}/${item.installment.count}` : ""}
              </span>
            ) : null}
            {isTransfer && item.transferGroupId ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 dark:text-emerald-300">
                Mesma transferência
              </span>
            ) : null}
            {item.deletedAt ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 dark:text-red-300">
                {item.deletionReason === "UNDONE" ? "Desfeito" : "Excluído"}
              </span>
            ) : null}
            {item.pending ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                Salvando…
              </span>
            ) : null}
          </span>
        </span>

        <span className="hidden truncate text-sm text-slate-700 md:block">
          {item.category?.name ?? "—"}
        </span>
        <span className="hidden truncate text-sm text-slate-700 md:block">{sourceName}</span>
        <span className="hidden md:block">
          {item.payer ? <Avatar name={item.payer.name} image={item.payer.image} size={28} /> : null}
        </span>

        <span className="flex items-center gap-2 justify-self-end">
          {item.payer ? (
            <span className="md:hidden">
              <Avatar name={item.payer.name} image={item.payer.image} size={24} />
            </span>
          ) : null}
          <span
            className={cn(
              "font-semibold tabular-nums",
              income && !neutral ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900",
              item.deletedAt && "line-through",
            )}
          >
            <Money cents={signedCents} signed />
          </span>
        </span>
      </button>
    </li>
  );
}
