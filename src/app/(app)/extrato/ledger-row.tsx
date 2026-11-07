"use client";

import { ArrowLeftRight, ListOrdered } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { SourceBadge } from "@/components/source-badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { useSettlementEnabled } from "@/lib/settlement-context";
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
  onViewPlan,
}: {
  installmentInTitle?: boolean;
  /** US-040b: "Ver compra" nas linhas de parcela (abre o diálogo do plano). */
  onViewPlan?: (planId: string) => void;
  item: PendingTransaction;
  highlighted: boolean;
  onOpen: () => void;
  onHover: (groupId: string | null) => void;
}) {
  const settlementEnabled = useSettlementEnabled();
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
  const sourceColor = isPayment
    ? (item.account?.color ?? null)
    : (item.card?.color ?? item.account?.color ?? null);
  const source = sourceColor ? <SourceBadge color={sourceColor} name={sourceName} /> : sourceName;
  const kindLabel = item.category?.name ?? (isPayment ? "Pagamento de fatura" : "Transferência");
  const signedCents = income ? item.amountInCents : -item.amountInCents;
  return (
    <li>
      {/* US-087: contêiner do card (borda, realce, hover do par); a linha clicável e as ações são irmãs */}
      <div
        data-testid="ledger-card"
        onMouseEnter={() => onHover(item.transferGroupId)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(item.transferGroupId)}
        onBlur={() => onHover(null)}
        className={cn(
          "rounded-xl border bg-white dark:bg-slate-100",
          highlighted ? "border-brand-700 ring-1 ring-brand-700" : "border-slate-200",
          item.pending && "opacity-70",
          item.deletedAt && "bg-slate-50",
        )}
      >
        <button
          type="button"
          data-testid="ledger-row"
          data-highlighted={highlighted ? "true" : undefined}
          data-pending={item.pending ? "true" : undefined}
          onClick={onOpen}
          className={cn(
            // colunas de avatar e valor com largura FIXA (nunca `auto`): alinham em todas as linhas
            "grid w-full grid-cols-[40px_minmax(0,1fr)_24px_6.75rem] items-center gap-x-2 gap-y-1 rounded-xl p-3 text-left hover:bg-slate-50",
            "md:grid-cols-[88px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_28px_7.5rem] md:gap-x-4",
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
          <span data-testid="ledger-date" className="hidden text-sm text-slate-500 md:block">
            {shortDate(item.occurredOn)}
          </span>

          <span className="min-w-0">
            <span
              className={cn(
                "line-clamp-2 break-words font-medium text-slate-900 md:line-clamp-1",
                item.deletedAt && "line-through",
              )}
            >
              {installmentInTitle ? installmentTitle(item) : rowTitle(item)}
            </span>
            <span
              data-testid="ledger-date"
              className="block break-words text-xs text-slate-500 md:hidden"
            >
              {shortDate(item.occurredOn)} · {kindLabel} · {source}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              {item.type === "EXPENSE" && settlementEnabled ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {item.isSharedExpense ? "Comum" : "Pessoal"}
                </span>
              ) : null}
              {item.card && item.type === "EXPENSE" ? (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                  Cartão
                </span>
              ) : null}
              {item.viaAssistant ? (
                <span
                  data-testid="via-assistant"
                  aria-label={`Lançado via assistente: ${item.viaAssistant.label}`}
                  className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
                >
                  via assistente
                </span>
              ) : null}
              {item.isSubscription ? (
                <span
                  data-testid="subscription-badge"
                  className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
                >
                  Assinatura
                </span>
              ) : null}
              {item.invoice ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  Fatura {formatInvoiceLabel(item.invoice.ref)}
                  {item.installment ? ` · ${item.installment.no}/${item.installment.count}` : ""}
                </span>
              ) : null}
              {item.tags.map((tag) => (
                <span
                  key={tag.id}
                  data-testid="tag-chip"
                  className="rounded-full border border-slate-200 bg-white dark:bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  {tag.name}
                </span>
              ))}
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
          <span className="hidden min-w-0 truncate text-sm text-slate-700 md:block">{source}</span>
          {/* avatar: célula sempre presente (vazia sem pagador) para manter a coluna */}
          <span className="flex items-center justify-center">
            {item.payer ? (
              <Avatar name={item.payer.name} image={item.payer.image} size={24} />
            ) : null}
          </span>

          <span
            className={cn(
              "flex justify-end whitespace-nowrap text-right font-semibold tabular-nums",
              income && !neutral ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900",
              item.deletedAt && "line-through",
            )}
          >
            <Money cents={signedCents} signed />
          </span>
        </button>
        {item.installment && onViewPlan ? (
          // US-088: ação do próprio card (irmã da linha clicável, não filha: não aninha button em button)
          <div className="flex justify-start border-t border-slate-200 px-2 py-1">
            <button
              type="button"
              data-testid="view-plan"
              aria-label="Ver compra"
              title="Ver compra"
              onClick={() =>
                onViewPlan((item.installment as NonNullable<typeof item.installment>).planId)
              }
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-brand-800 hover:bg-slate-100 dark:text-emerald-300"
            >
              <ListOrdered size={20} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
