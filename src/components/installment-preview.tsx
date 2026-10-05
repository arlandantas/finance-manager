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
}: {
  totalInCents: number;
  count: number;
  purchaseOn: string;
  closingDay: number;
}) {
  const p = previewInstallments({ totalInCents, count, purchaseOn, closingDay });
  const where = `1ª na fatura de ${formatInvoiceLabel(p.firstInvoiceRef)}`;
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
