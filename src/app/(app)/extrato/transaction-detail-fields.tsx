"use client";

import { Money } from "@/components/money";
import { SourceBadge } from "@/components/source-badge";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";

export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Campos do detalhe do lançamento (somente leitura). */
export function DetailFields({
  t,
  installment,
}: {
  t: TransactionDetailDTO;
  installment: TransactionDetailDTO["installment"];
}) {
  return (
    <dl>
      <Row label="Valor">
        {t.direction === "CREDIT" ? "+" : "-"}
        <Money cents={t.amountInCents} />
      </Row>
      <Row label="Descrição">{t.description}</Row>
      <Row label="Data">{brDate(t.occurredOn)}</Row>
      {installment ? (
        <Row label="Parcela">
          {installment.no}/{installment.count}
        </Row>
      ) : null}
      {t.category ? (
        <Row label="Categoria">
          {t.category.archived ? `${t.category.name} (arquivada)` : t.category.name}
        </Row>
      ) : null}
      {t.account ? (
        <Row label="Conta">
          <SourceBadge color={t.account.color} name={t.account.name} />
        </Row>
      ) : null}
      {t.card ? (
        <Row label="Cartão">
          <SourceBadge color={t.card.color} name={t.card.name} />
        </Row>
      ) : null}
      {t.invoice ? (
        <Row label="Fatura">
          {formatInvoiceLabel(t.invoice.ref)} · fecha {brDate(t.invoice.closingDate)} · vence{" "}
          {brDate(t.invoice.dueDate)}
        </Row>
      ) : null}
      {t.type === "EXPENSE" ? (
        <Row label="Divisão">{t.isSharedExpense ? "Dividida com a família" : "Só meu"}</Row>
      ) : null}
      {t.tags.length > 0 ? (
        <Row label="Tags">
          <span className="flex flex-wrap justify-end gap-1" data-testid="detail-tags">
            {t.tags.map((tag) => (
              <span
                key={tag.id}
                data-testid="tag-chip"
                className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                {tag.name}
              </span>
            ))}
          </span>
        </Row>
      ) : null}
      {t.note ? <Row label="Observação">{t.note}</Row> : null}
      {t.deletedAt ? (
        <Row label="Situação">{t.deletionReason === "UNDONE" ? "Desfeito" : "Excluído"}</Row>
      ) : null}
    </dl>
  );
}
