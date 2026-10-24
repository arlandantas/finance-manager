"use client";

import { Money } from "@/components/money";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { previewInstallments } from "@/modules/cartoes/installments";

/** Prévia ao vivo no drawer (US-040a): "10x de R$ 250,00 · 1ª na fatura de nov/2026". */
export function InstallmentPreviewText({
  totalInCents,
  count,
  purchaseOn,
  closingDay,
  paidBeforeApp = 0,
}: {
  totalInCents: number;
  count: number;
  purchaseOn: string;
  closingDay: number;
  paidBeforeApp?: number;
}) {
  const p = previewInstallments({ totalInCents, count, purchaseOn, closingDay, paidBeforeApp });
  const where = `1ª na fatura de ${formatInvoiceLabel(p.firstInvoiceRef)}`;
  if (p.paidBeforeApp >= 1) {
    const where2 = `na fatura de ${formatInvoiceLabel(p.firstInvoiceRef)}`;
    return (
      <div data-testid="installment-preview" className="text-sm text-slate-600">
        <p>
          {p.remainingCount === 1
            ? "Resta 1 parcela de "
            : `Restam ${p.remainingCount} parcelas de `}
          <Money cents={p.remainingEachInCents} /> ·{" "}
          {p.remainingCount === 1
            ? `(${p.count}/${p.count}) ${where2}`
            : `a próxima (${p.nextNo}/${p.count}) ${where2}`}
        </p>
        {p.remainderOnPaidParcel ? (
          <p data-testid="installment-preview-remainder">
            A diferença de centavos ficou na 1ª parcela, já paga
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <p data-testid="installment-preview" className="text-sm text-slate-600">
      {p.sameAmount ? (
        <>
          {p.count}x de <Money cents={p.firstInCents} />
        </>
      ) : (
        <>
          1ª de <Money cents={p.firstInCents} /> + {p.count - 1}x de{" "}
          <Money cents={p.othersInCents} />
        </>
      )}{" "}
      · {where}
    </p>
  );
}
