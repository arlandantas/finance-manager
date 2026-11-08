"use client";

import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InstallmentPlanDialog } from "@/components/installment-plan-dialog";
import { Money } from "@/components/money";
import { SourceBadge } from "@/components/source-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/http";
import { cycleSentence, formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useCard, useInvoice } from "@/modules/cartoes/hooks";
import { LedgerRow } from "../../extrato/ledger-row";
import { TransactionDetailDrawer } from "../../extrato/transaction-detail-drawer";
import { PayerLine } from "../payer-line";
import { PayInvoiceDrawer } from "./pay-invoice-drawer";
import { StatusChip } from "./status-chip";
import { SubscriptionDrawer } from "./subscription-drawer";
import { ProjectedLine, SubscriptionsBlock } from "./subscriptions-block";
import { UndoPaymentDrawer } from "./undo-payment-drawer";

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function InvoiceScreen({
  cardId,
  importEnabled = false,
}: {
  cardId: string;
  importEnabled?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const card = useCard(cardId);
  const refParam = params.get("ref");
  const ref = refParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(refParam) ? refParam : null;
  const openRef = card.data?.card.openInvoice.ref ?? null;
  const effectiveRef = ref ?? openRef;
  const invoice = useInvoice(cardId, effectiveRef);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [newSub, setNewSub] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const c = card.data?.card;
  const inv = invoice.data?.invoice;

  // Atalho da Home ("Pagar fatura"): abre o drawer uma única vez quando a fatura é pagável.
  const autoPay = params.get("pay") === "1";
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoPay && inv?.canPay && !autoOpened.current) {
      autoOpened.current = true;
      setPaying(true);
    }
  }, [autoPay, inv?.canPay]);

  const notFound =
    (card.error instanceof ApiClientError && card.error.status === 404) ||
    (invoice.error instanceof ApiClientError && invoice.error.status === 404);
  const failed = (card.isError || invoice.isError) && !notFound;

  const go = (next: string | null) => {
    if (next) router.replace(`/cartoes/${cardId}?ref=${next}`);
  };

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/cartoes"
        className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand-800 dark:text-emerald-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Cartões
      </Link>

      {notFound ? (
        <div
          role="alert"
          className="rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-6 text-center"
        >
          <p className="font-semibold text-slate-900">Não encontrado</p>
          <p className="text-sm text-slate-600">Este cartão ou fatura não existe na sua família.</p>
        </div>
      ) : null}

      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button
            variant="secondary"
            onClick={() => {
              void card.refetch();
              void invoice.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {!notFound && !failed && (card.isPending || invoice.isPending || !inv || !c) ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando fatura">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
          <Skeleton className="h-20" />
        </div>
      ) : null}

      {c && inv ? (
        <>
          <header className="rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4">
            <h1 className="text-2xl font-semibold text-slate-900">
              <SourceBadge color={c.color} name={c.name} />
            </h1>
            <p className="text-sm text-slate-600">{cycleSentence(c.closingDay, c.dueDay)}</p>
            <PayerLine card={c} />
            <div className="mt-3 flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="text-slate-600">
                Limite{" "}
                <span data-testid="card-limit">
                  <Money cents={c.limitInCents} />
                </span>
              </span>
              <span className="text-slate-600">
                Usado{" "}
                <span data-testid="card-used">
                  <Money cents={c.usedInCents} />
                </span>
              </span>
              <span
                className={cn(
                  "font-semibold",
                  c.availableInCents < 0 ? "text-red-700 dark:text-red-300" : "text-slate-900",
                )}
              >
                Disponível{" "}
                <span data-testid="card-available">
                  <Money cents={c.availableInCents} />
                </span>
              </span>
            </div>
          </header>

          <section
            aria-label="Fatura"
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                aria-label="Fatura anterior"
                disabled={!inv.previousRef}
                onClick={() => go(inv.previousRef)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </Button>
              <h2 data-testid="invoice-ref" className="text-lg font-semibold text-slate-900">
                {formatInvoiceLabel(inv.ref)}
              </h2>
              <Button
                variant="ghost"
                aria-label="Próxima fatura"
                disabled={!inv.nextRef}
                onClick={() => go(inv.nextRef)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusChip invoice={inv} />
              {inv.payment ? (
                <span
                  data-testid="invoice-paid-on"
                  className="text-sm font-semibold text-emerald-800 dark:text-emerald-300"
                >
                  Paga em {brDate(inv.payment.paidOn)}
                </span>
              ) : null}
              {inv.status === "CLOSED" && inv.totalInCents > 0 ? (
                <span
                  data-testid="invoice-to-pay"
                  className="text-sm font-semibold text-amber-900 dark:text-amber-200"
                >
                  A pagar
                </span>
              ) : null}
            </div>
            <p
              data-testid="invoice-total"
              className="text-3xl font-bold tabular-nums text-slate-900"
            >
              <Money cents={inv.totalInCents} />
            </p>
            <p data-testid="invoice-dates" className="text-sm text-slate-600">
              Fecha em {brDate(inv.closingDate)} · vence em {brDate(inv.dueDate)}
            </p>
            {inv.status === "OPEN" && !inv.isFuture ? (
              <ProjectedLine cardId={cardId} invoiceRef={inv.ref} closingDay={c.closingDay} />
            ) : null}
            {inv.futureInstallmentsInCents > 0 ? (
              <p data-testid="invoice-future-installments" className="text-sm text-slate-600">
                Parcelas futuras: <Money cents={inv.futureInstallmentsInCents} />
              </p>
            ) : null}
            {inv.canPay ? <Button onClick={() => setPaying(true)}>Pagar fatura</Button> : null}
            {importEnabled && inv.status !== "PAID" && !inv.isFuture && !c.archived ? (
              <Link
                href={`/cartoes/${cardId}/importar?ref=${inv.ref}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 dark:bg-slate-100"
              >
                Importar fatura
              </Link>
            ) : null}
            {inv.payment ? (
              <Button variant="secondary" onClick={() => setUndoing(true)}>
                Desfazer pagamento
              </Button>
            ) : null}
            <ul className="flex flex-wrap gap-2" aria-label="Subtotal por membro">
              {inv.byMember.map((m) => (
                <li
                  key={m.member.id}
                  data-testid="invoice-member"
                  className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm"
                >
                  <Avatar name={m.member.name} image={m.member.image} size={24} />
                  <span>
                    {m.member.name.split(" ")[0]} <Money cents={m.totalInCents} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <SubscriptionsBlock cardId={cardId} onNew={() => setNewSub(true)} />

          {inv.purchases.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-6 text-center text-slate-700">
              Nenhuma compra nesta fatura
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Compras da fatura">
              {inv.purchases.map((p) => (
                <LedgerRow
                  key={p.id}
                  item={p}
                  highlighted={false}
                  installmentInTitle
                  onViewPlan={setPlanId}
                  onOpen={() => setDetailId(p.id)}
                  onHover={() => undefined}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}

      {c && inv ? (
        <PayInvoiceDrawer
          open={paying}
          cardName={c.name}
          ownerMemberId={c.owner.id}
          defaultAccountId={
            c.paymentAccount && !c.paymentAccount.archived ? c.paymentAccount.id : null
          }
          invoice={inv}
          onClose={() => setPaying(false)}
        />
      ) : null}

      {c ? (
        <SubscriptionDrawer
          open={newSub}
          card={{ id: c.id, name: c.name, closingDay: c.closingDay }}
          onClose={() => setNewSub(false)}
        />
      ) : null}

      <UndoPaymentDrawer
        cardId={cardId}
        invoiceRef={inv?.ref ?? ""}
        paymentVersion={inv?.payment?.version ?? null}
        open={undoing}
        onOpenChange={setUndoing}
      />

      <TransactionDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
      <InstallmentPlanDialog planId={planId} onClose={() => setPlanId(null)} />
    </main>
  );
}
