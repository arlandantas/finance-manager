"use client";

import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptions } from "@/modules/assinaturas/hooks";
import { projectedInCycle } from "@/modules/assinaturas/schedule";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";

/** "Assinaturas previstas neste ciclo" (US-096c): informativo, nunca somado ao total da fatura. */
export function ProjectedLine({
  cardId,
  invoiceRef,
  closingDay,
}: {
  cardId: string;
  invoiceRef: string;
  closingDay: number;
}) {
  const subs = useSubscriptions({ status: "active", cardId });
  const cents = projectedInCycle(subs.data?.items ?? [], invoiceRef, closingDay);
  if (cents <= 0) return null;
  return (
    <p data-testid="invoice-projected-subscriptions" className="text-sm text-slate-600">
      Assinaturas previstas neste ciclo: <Money cents={cents} />
    </p>
  );
}

const SKIP_TEXT = {
  INVOICE_PAID: "fatura paga",
  CARD_ARCHIVED: "cartão arquivado",
} as const;

/** Bloco "Assinaturas do cartão" na tela do cartão (US-096c). */
export function SubscriptionsBlock({ cardId, onNew }: { cardId: string; onNew: () => void }) {
  const subs = useSubscriptions({ status: "active", cardId });
  const items = subs.data?.items ?? [];
  return (
    <section
      aria-label="Assinaturas do cartão"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Assinaturas do cartão</h2>
        <Button variant="secondary" onClick={onNew}>
          Nova assinatura
        </Button>
      </div>
      {subs.isPending ? (
        <div aria-busy="true" aria-label="Carregando assinaturas">
          <Skeleton className="h-12" />
        </div>
      ) : subs.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-800 dark:text-red-300">
            Não foi possível carregar as assinaturas
          </p>
          <Button variant="secondary" onClick={() => void subs.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-700">Nenhuma assinatura neste cartão</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li
              key={s.id}
              data-testid="subscription-item"
              className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words font-medium text-slate-900">
                  {s.description}
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">
                  <Money cents={s.currentAmountInCents} />
                </span>
              </div>
              <span className="text-sm text-slate-600">Todo dia {s.dayOfMonth}</span>
              {s.recentSkips.map((k) => (
                <p
                  key={`${k.month}-${k.reason}`}
                  data-testid="subscription-skip"
                  role="status"
                  className="text-sm text-amber-900 dark:text-amber-200"
                >
                  Cobrança de {formatInvoiceLabel(k.month)} não lançada: {SKIP_TEXT[k.reason]}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
