"use client";

import Link from "next/link";
import { Money } from "@/components/money";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import type { ArchiveBlocker } from "@/modules/cartoes/hooks";

const LABEL: Record<string, string> = {
  CARD_HAS_UNPAID_INVOICE: "Fatura não paga",
  CARD_HAS_OPEN_PURCHASES: "Fatura aberta com compras",
  CARD_HAS_FUTURE_INSTALLMENTS: "Parcelas futuras",
};

/** US-054: lista todos os impedimentos antes de confirmar o arquivamento do cartão. */
export function ArchiveBlockers({
  cardId,
  blockers,
}: {
  cardId: string;
  blockers: ArchiveBlocker[];
}) {
  return (
    <ul
      data-testid="archive-blockers"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      {blockers.map((b) => (
        <li key={`${b.code}-${b.ref ?? ""}`} className="flex flex-col gap-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{b.message}</p>
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span>{LABEL[b.code] ?? "Pendência"}</span>
            {b.ref ? <span> ({formatInvoiceLabel(b.ref)})</span> : null}{" "}
            {b.amountInCents !== undefined ? <Money cents={b.amountInCents} /> : null}
            {b.ref ? (
              <>
                {" · "}
                <Link
                  href={`/cartoes/${cardId}?ref=${b.ref}`}
                  className="inline-flex min-h-11 items-center font-semibold underline"
                >
                  Ver fatura
                </Link>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
