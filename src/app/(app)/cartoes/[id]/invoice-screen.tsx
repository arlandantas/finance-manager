"use client";

import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError } from "@/lib/http";
import { formatBRL } from "@/lib/money";
import { cycleSentence, formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useCard, useInvoice } from "@/modules/cartoes/hooks";
import type { InvoiceDTO } from "@/modules/cartoes/schemas";
import { LedgerRow } from "../../extrato/ledger-row";
import { TransactionDetailDrawer } from "../../extrato/transaction-detail-drawer";

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function StatusChip({ invoice }: { invoice: InvoiceDTO }) {
  const label = invoice.isOverdue
    ? "Vencida"
    : invoice.status === "OPEN"
      ? "Aberta"
      : invoice.status === "PAID"
        ? "Paga"
        : "Fechada";
  const tone = invoice.isOverdue
    ? "bg-red-100 text-red-800"
    : invoice.status === "PAID"
      ? "bg-emerald-100 text-emerald-800"
      : invoice.status === "CLOSED"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      data-testid="invoice-status"
      className={cn("rounded-full px-3 py-1 text-sm font-semibold", tone)}
    >
      {label}
    </span>
  );
}

export function InvoiceScreen({ cardId }: { cardId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const card = useCard(cardId);
  const refParam = params.get("ref");
  const ref = refParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(refParam) ? refParam : null;
  const openRef = card.data?.card.openInvoice.ref ?? null;
  const effectiveRef = ref ?? openRef;
  const invoice = useInvoice(cardId, effectiveRef);
  const [detailId, setDetailId] = useState<string | null>(null);
  const c = card.data?.card;
  const inv = invoice.data?.invoice;

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
        className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand-800"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Cartões
      </Link>

      {notFound ? (
        <div role="alert" className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-semibold text-slate-900">Não encontrado</p>
          <p className="text-sm text-slate-600">Este cartão ou fatura não existe na sua família.</p>
        </div>
      ) : null}

      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
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
          <header className="rounded-xl border border-slate-200 bg-white p-4">
            <h1 className="text-2xl font-semibold text-slate-900">{c.name}</h1>
            <p className="text-sm text-slate-600">{cycleSentence(c.closingDay, c.dueDay)}</p>
            <div className="mt-3 flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="text-slate-600">
                Limite <span data-testid="card-limit">{formatBRL(c.limitInCents)}</span>
              </span>
              <span className="text-slate-600">
                Usado <span data-testid="card-used">{formatBRL(c.usedInCents)}</span>
              </span>
              <span
                className={cn(
                  "font-semibold",
                  c.availableInCents < 0 ? "text-red-700" : "text-slate-900",
                )}
              >
                Disponível <span data-testid="card-available">{formatBRL(c.availableInCents)}</span>
              </span>
            </div>
          </header>

          <section
            aria-label="Fatura"
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
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
              {inv.status === "CLOSED" && inv.totalInCents > 0 ? (
                <span data-testid="invoice-to-pay" className="text-sm font-semibold text-amber-900">
                  A pagar
                </span>
              ) : null}
            </div>
            <p
              data-testid="invoice-total"
              className="text-3xl font-bold tabular-nums text-slate-900"
            >
              {formatBRL(inv.totalInCents)}
            </p>
            <p data-testid="invoice-dates" className="text-sm text-slate-600">
              Fecha em {brDate(inv.closingDate)} · vence em {brDate(inv.dueDate)}
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Subtotal por membro">
              {inv.byMember.map((m) => (
                <li
                  key={m.member.id}
                  data-testid="invoice-member"
                  className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 text-sm"
                >
                  <Avatar name={m.member.name} image={m.member.image} size={24} />
                  <span>
                    {m.member.name.split(" ")[0]} {formatBRL(m.totalInCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {inv.purchases.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">
              Nenhuma compra nesta fatura
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Compras da fatura">
              {inv.purchases.map((p) => (
                <LedgerRow
                  key={p.id}
                  item={p}
                  highlighted={false}
                  onOpen={() => setDetailId(p.id)}
                  onHover={() => undefined}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}

      <TransactionDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
    </main>
  );
}
